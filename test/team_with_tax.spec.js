const path = require('path')
// eslint-disable-next-line no-unused-vars
const { Testkit, Utils } = require('aa-testkit')
const { Network } = Testkit({
	TESTDATA_DIR: path.join(__dirname, '../testdata'),
})

describe('Check 51 attack game team with founder tax', function () {
	this.timeout(120 * 1000)

	before(async () => {
		this.network = await Network.create()
		// this.explorer = await this.network.newObyteExplorer().ready()
		this.genesis = await this.network.getGenesisNode().ready()

		this.teamRed = {}
		this.teamBlue = {};

		[
			this.deployer,
			this.teamRed.founder,
			this.teamRed.alice,
			this.teamRed.bob,
			this.teamBlue.founder,
			this.teamBlue.mark,
			this.teamBlue.eva,
		] = await Utils.asyncStartHeadlessWallets(this.network, 7)

		this.teamRed.address = await this.teamRed.founder.getAddress()
		this.teamBlue.address = await this.teamBlue.founder.getAddress()

		await this.genesis.sendBytes({ toAddress: await this.teamRed.founder.getAddress(), amount: 1e9 })
		await this.genesis.sendBytes({ toAddress: await this.teamRed.alice.getAddress(), amount: 1e9 })
		await this.genesis.sendBytes({ toAddress: await this.teamRed.bob.getAddress(), amount: 1e9 })

		await this.genesis.sendBytes({ toAddress: await this.teamBlue.founder.getAddress(), amount: 1e9 })
		await this.genesis.sendBytes({ toAddress: await this.teamBlue.mark.getAddress(), amount: 1e9 })
		await this.genesis.sendBytes({ toAddress: await this.teamBlue.eva.getAddress(), amount: 1e9 })

		const { error, unit } = await this.genesis.sendBytes({ toAddress: await this.deployer.getAddress(), amount: 1e9 })

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		await this.network.witnessUntilStable(unit)
	})

	it('Deploy 51 attack game AA', async () => {
		const { address, unit, error } = await this.deployer.deployAgent(path.join(__dirname, './agents/51_attack_game.agent'))

		expect(error).to.be.null
		expect(unit).to.be.validUnit
		expect(address).to.be.validAddress

		this.aaAddress = address

		await this.network.witnessUntilStable(unit)
	})

	it('Red creates a team', async () => {
		const { unit, error } = await this.teamRed.founder.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: 15000,
			data: {
				create_team: true,
				founder_tax: 0.5,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		await this.network.witnessUntilStable(response.response_unit)

		this.teamRed.asset = response.response.responseVars.team_asset
		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		expect(this.teamRed.asset).to.be.validBase64
	})

	it('Blue creates a team', async () => {
		const { unit, error } = await this.teamBlue.founder.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: 15000,
			data: {
				create_team: true,
				founder_tax: 0.5,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		await this.network.witnessUntilStable(response.response_unit)

		this.teamBlue.asset = response.response.responseVars.team_asset
		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		expect(this.teamBlue.asset).to.be.validBase64
	})

	it('Red founder contributes', async () => {
		const { unit, error } = await this.teamRed.founder.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: 1e8,
			data: {
				team: this.teamRed.address,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		await this.network.witnessUntilStable(response.response_unit)

		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		expect(response.updatedStateVars[this.aaAddress].winner.value).to.be.string(this.teamRed.address)

		const balance = await this.teamRed.founder.getBalance()
		expect(balance[this.teamRed.asset].stable).to.be.equal(1e8)
	})

	it('Red Alice can not contribute to winning team', async () => {
		const { unit, error } = await this.teamRed.alice.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: 1e8,
			data: {
				team: this.teamRed.address,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)

		expect(response.bounced).to.be.true
		expect(response.response.error).to.be.string('contributions to candidate winner team are not allowed')
	})

	it('Blue founder contributes but red team is still the winner', async () => {
		const { unit, error } = await this.teamBlue.founder.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: 1e8,
			data: {
				team: this.teamBlue.address,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false

		await this.network.witnessUntilStable(response.response_unit)
		const balance = await this.teamBlue.founder.getBalance()
		expect(balance[this.teamBlue.asset].stable).to.be.equal(1e8)

		const { vars } = await this.teamBlue.founder.readAAStateVars(this.aaAddress)
		expect(vars.winner).to.be.equal(this.teamRed.address)
	})

	it('Blue Mark contributes and blue team becomes the winner', async () => {
		const { unit, error } = await this.teamBlue.mark.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: 1e8,
			data: {
				team: this.teamBlue.address,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		expect(response.updatedStateVars[this.aaAddress].winner.value).to.be.string(this.teamBlue.address)

		await this.network.witnessUntilStable(response.response_unit)
		const balance = await this.teamBlue.mark.getBalance()
		expect(balance[this.teamBlue.asset].stable).to.be.equal(1e8)

		const { vars } = await this.teamBlue.mark.readAAStateVars(this.aaAddress)
		expect(vars.winner).to.be.equal(this.teamBlue.address)
	})

	it('Red Alice contributes but blue team is still winner', async () => {
		const { unit, error } = await this.teamRed.alice.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: 1e8,
			data: {
				team: this.teamRed.address,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false

		await this.network.witnessUntilStable(response.response_unit)
		const balance = await this.teamRed.alice.getBalance()
		expect(balance[this.teamRed.asset].stable).to.be.equal(1e8)

		const { vars } = await this.teamRed.alice.readAAStateVars(this.aaAddress)
		expect(vars.winner).to.be.equal(this.teamBlue.address)
	})

	it('Red Bob contributes and red team becomes the winner', async () => {
		const { unit, error } = await this.teamRed.bob.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: 1e8,
			data: {
				team: this.teamRed.address,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false

		await this.network.witnessUntilStable(response.response_unit)
		const balance = await this.teamRed.bob.getBalance()
		expect(balance[this.teamRed.asset].stable).to.be.equal(1e8)

		const { vars } = await this.teamRed.bob.readAAStateVars(this.aaAddress)
		expect(vars.winner).to.be.equal(this.teamRed.address)
	})

	it('Blue Eva contributes but red team is still winner', async () => {
		const { unit, error } = await this.teamBlue.eva.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: 1e8,
			data: {
				team: this.teamBlue.address,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false

		await this.network.witnessUntilStable(response.response_unit)
		const balance = await this.teamBlue.eva.getBalance()
		expect(balance[this.teamBlue.asset].stable).to.be.equal(1e8)

		const { vars } = await this.teamBlue.eva.readAAStateVars(this.aaAddress)
		expect(vars.winner).to.be.equal(this.teamRed.address)
	})

	it('Fastforward time to finish challenge', async () => {
		const { time: timeBefore } = await this.genesis.getTime()
		await this.network.timetravel({ shift: '2d' })
		const { time: timeAfter } = await this.genesis.getTime()
		expect(timeBefore).to.be.approximately(timeAfter - 86400 * 1000 * 2, 500)
	})

	it('Red Founder finishes the challenging', async () => {
		const { unit, error } = await this.teamRed.founder.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: 10000,
			data: {
				finish: true,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)

		expect(response.bounced).to.be.false

		const vars = response.updatedStateVars[this.aaAddress]
		expect(vars.finished.value).to.be.equal(1)
		expect(vars.total.value).to.be.equal(600024908) // sum of all contributions plus AA bounce fees minus AA response fees

		this.prizeAmount = vars.total.value
	})

	it('Red founder sends his team assets to team founder address', async () => {
		// it is important for team founder to send asset for payout
		// from the same address he used to create team if he wants to receive founder tax
		const { unit, error } = await this.teamRed.founder.sendMulti({
			asset: this.teamRed.asset,
			asset_outputs: [
				{
					address: this.teamRed.address,
					amount: 1e8,
				},
			],
		})
		expect(error).to.be.null
		expect(unit).to.be.validUnit

		await this.network.witnessUntilStable(unit)
	})

	it('Red founder funds his team founder wallet address', async () => {
		const { unit, error } = await this.teamRed.founder.sendBytes({
			toAddress: this.teamRed.address,
			amount: 1e5,
		})
		expect(error).to.be.null
		expect(unit).to.be.validUnit

		await this.network.witnessUntilStable(unit)
	})

	it('Red founder collects the prize', async () => {
		const { unit, error } = await this.teamRed.founder.sendMulti({
			paying_addresses: [this.teamRed.address],
			asset: this.teamRed.asset,
			asset_outputs: [
				{
					address: this.aaAddress,
					amount: 1e8,
				},
			],
			base_outputs: [
				{
					address: this.aaAddress,
					amount: 10000,
				},
			],
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		await this.network.witnessUntilStable(response.response_unit)

		const { unitObj: payoutUnitObj, error: payoutError } = await this.teamRed.founder.getUnitInfo({ unit: response.response_unit })
		expect(payoutError).to.be.null

		const balance = await this.teamRed.founder.getBalance()
		expect(balance[this.teamRed.asset].stable).to.be.equal(0)
		expect(balance[this.teamRed.asset].pending).to.be.equal(0)

		const ownAddresses = await this.teamRed.founder.getOwnedAddresses()
		const paymentMessage = payoutUnitObj.messages.find(m => m.app === 'payment')

		const payout = paymentMessage.payload.outputs.find(out => ownAddresses.includes(out.address))
		expect(payout.amount).to.be.equal(400016605)
	})

	it('Red Alice collects the prize', async () => {
		const { unit, error } = await this.teamRed.alice.sendMulti({
			asset: this.teamRed.asset,
			asset_outputs: [
				{
					address: this.aaAddress,
					amount: 1e8,
				},
			],
			base_outputs: [
				{
					address: this.aaAddress,
					amount: 10000,
				},
			],
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		await this.network.witnessUntilStable(response.response_unit)

		const { unitObj: payoutUnitObj, error: payoutError } = await this.teamRed.alice.getUnitInfo({ unit: response.response_unit })
		expect(payoutError).to.be.null

		const balance = await this.teamRed.alice.getBalance()
		expect(balance[this.teamRed.asset].stable).to.be.equal(0)
		expect(balance[this.teamRed.asset].pending).to.be.equal(0)

		const ownAddresses = await this.teamRed.alice.getOwnedAddresses()
		const paymentMessage = payoutUnitObj.messages.find(m => m.app === 'payment')

		const payout = paymentMessage.payload.outputs.find(out => ownAddresses.includes(out.address))
		expect(payout.amount).to.be.equal(100004151)
	})

	it('Red Bob collects the prize', async () => {
		const { unit, error } = await this.teamRed.bob.sendMulti({
			asset: this.teamRed.asset,
			asset_outputs: [
				{
					address: this.aaAddress,
					amount: 1e8,
				},
			],
			base_outputs: [
				{
					address: this.aaAddress,
					amount: 10000,
				},
			],
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		await this.network.witnessUntilStable(response.response_unit)

		const { unitObj: payoutUnitObj, error: payoutError } = await this.teamRed.bob.getUnitInfo({ unit: response.response_unit })
		expect(payoutError).to.be.null

		const balance = await this.teamRed.bob.getBalance()
		expect(balance[this.teamRed.asset].stable).to.be.equal(0)
		expect(balance[this.teamRed.asset].pending).to.be.equal(0)

		const ownAddresses = await this.teamRed.bob.getOwnedAddresses()
		const paymentMessage = payoutUnitObj.messages.find(m => m.app === 'payment')

		const payout = paymentMessage.payload.outputs.find(out => ownAddresses.includes(out.address))
		expect(payout.amount).to.be.equal(100004151)
	})

	after(async () => {
		// uncomment this line to pause test execution to get time for Obyte DAG explorer inspection
		// await Utils.sleep(3600 * 1000)
		await this.network.stop()
	})
})
