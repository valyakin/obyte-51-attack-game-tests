const path = require('path')
// eslint-disable-next-line no-unused-vars
const { Testkit, Utils } = require('aa-testkit')
const { Network } = Testkit({
	TESTDATA_DIR: path.join(__dirname, '../testdata'),
})

describe('Check 51 attack game one vs one', function () {
	this.timeout(120 * 1000)

	before(async () => {
		this.network = await Network.create()
		// this.explorer = await this.network.newObyteExplorer().ready()
		this.genesis = await this.network.getGenesisNode().ready();

		[
			this.deployer,
			this.founderRed,
			this.founderBlue,
		] = await Utils.asyncStartHeadlessWallets(this.network, 3)

		const { unit, error } = await this.genesis.sendBytes({
			toAddress: await this.deployer.getAddress(),
			amount: 1e9,
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		await this.network.witnessUntilStable(unit)

		const balance = await this.deployer.getBalance()
		expect(balance.base.stable).to.be.equal(1e9)
	})

	it('Send bytes to founderRed', async () => {
		const { unit, error } = await this.genesis.sendBytes({
			toAddress: await this.founderRed.getAddress(),
			amount: 1e9,
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		await this.network.witnessUntilStable(unit)
		const balance = await this.founderRed.getBalance()
		expect(balance.base.stable).to.be.equal(1e9)
	})

	it('Send bytes to founderBlue', async () => {
		const { unit, error } = await this.genesis.sendBytes({
			toAddress: await this.founderBlue.getAddress(),
			amount: 1e9,
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		await this.network.witnessUntilStable(unit)
		const balance = await this.founderBlue.getBalance()
		expect(balance.base.stable).to.be.equal(1e9)
	})

	it('Deploy 51 attack game AA', async () => {
		const { address, unit, error } = await this.deployer.deployAgent(path.join(__dirname, './agents/51_attack_game.agent'))

		expect(error).to.be.null
		expect(unit).to.be.validUnit
		expect(address).to.be.validAddress

		this.aaAddress = address

		await this.network.witnessUntilStable(unit)
	})

	it('founderRed creates a team', async () => {
		const { unit, error } = await this.founderRed.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: 15000,
			data: {
				create_team: true,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		await this.network.witnessUntilStable(response.response_unit)

		this.teamRedAsset = response.response.responseVars.team_asset
		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		expect(this.teamRedAsset).to.be.validBase64

		this.teamRedAddress = await this.founderRed.getAddress()
	})

	it('founderBlue creates a team', async () => {
		const { unit, error } = await this.founderBlue.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: 15000,
			data: {
				create_team: true,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		await this.network.witnessUntilStable(response.response_unit)

		this.teamBlueAsset = response.response.responseVars.team_asset
		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		expect(this.teamBlueAsset).to.be.validBase64

		this.teamBlueAddress = await this.founderBlue.getAddress()
	})

	it('founderRed contributes', async () => {
		const { unit, error } = await this.founderRed.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: 1e8,
			data: {
				team: this.teamRedAddress,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		await this.network.witnessUntilStable(response.response_unit)

		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		expect(response.updatedStateVars[this.aaAddress].winner.value).to.be.string(this.teamRedAddress)

		const balance = await this.founderRed.getBalance()
		expect(balance[this.teamRedAsset].stable).to.be.equal(1e8)
	})

	it('founderBlue contributes x2', async () => {
		const { unit, error } = await this.founderBlue.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: 2e8,
			data: {
				team: this.teamBlueAddress,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		await this.network.witnessUntilStable(response.response_unit)

		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		expect(response.updatedStateVars[this.aaAddress].winner.value).to.be.string(this.teamBlueAddress)

		const balance = await this.founderBlue.getBalance()
		expect(balance[this.teamBlueAsset].stable).to.be.equal(2e8)
	})

	it('founderRed adds contributions', async () => {
		const { unit, error } = await this.founderRed.triggerAaWithData({
			toAddress: this.aaAddress,
			amount: 2e8,
			data: {
				team: this.teamRedAddress,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		const { response } = await this.network.getAaResponseToUnit(unit)
		await this.network.witnessUntilStable(response.response_unit)

		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		expect(response.updatedStateVars[this.aaAddress].winner.value).to.be.string(this.teamRedAddress)

		const balance = await this.founderRed.getBalance()
		expect(balance[this.teamRedAsset].stable).to.be.equal(3e8)
	})

	it('Fastforward time to finish challenge', async () => {
		const { time: timeBefore } = await this.genesis.getTime()
		await this.network.timetravel({ shift: '2d' })
		const { time: timeAfter } = await this.genesis.getTime()

		expect(timeBefore).to.be.approximately(timeAfter - 86400 * 1000 * 2, 500)
	})

	it('founderRed finishes the challenging', async () => {
		const { unit, error } = await this.founderRed.triggerAaWithData({
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
		expect(vars.total.value).to.be.equal(500017130) // sum of all contributions plus AA bounce fees minus AA response fees

		this.prizeAmount = vars.total.value
	})

	it('founderRed collects the prize', async () => {
		const { unit, error } = await this.founderRed.sendMulti({
			asset: this.teamRedAsset,
			asset_outputs: [
				{
					address: this.aaAddress,
					amount: 3e8,
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

		const { unitObj: collectingPrizeUnitObj, error: collectingPrizeError } = await this.founderBlue.getUnitInfo({ unit: response.response_unit })
		expect(collectingPrizeError).to.be.null

		const balance = await this.founderRed.getBalance()

		expect(balance[this.teamRedAsset].stable).to.be.equal(0)
		expect(balance[this.teamRedAsset].pending).to.be.equal(0)

		const founderRedAddresses = await this.founderRed.getOwnedAddresses()
		const paymentMessage = collectingPrizeUnitObj.unit.messages.find(m => m.app === 'payment')

		// get payout to one of addresses owned by founderRed
		const payout = paymentMessage.payload.outputs.find(out => founderRedAddresses.includes(out.address))

		expect(payout.amount).to.be.equal(this.prizeAmount)
	})

	after(async () => {
		// uncomment this line to pause test execution to get time for Obyte DAG explorer inspection
		// await Utils.sleep(3600 * 1000)
		await this.network.stop()
	})
})
