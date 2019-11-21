const path = require('path')
const { Testkit, Utils } = require('aa-testkit')
const { Network } = Testkit({
	TESTDATA_DIR: path.join(__dirname, '../testdata'),
})

describe('Check 51 attack game one vs one', function () {
	this.timeout(120 * 1000)

	before(async () => {
		this.network = await Network.create()
		this.explorer = await this.network.newObyteExplorer().ready()
		this.genesis = await this.network.getGenesisNode().ready()
		this.deployer = await this.network.newHeadlessWallet().ready()

		this.founderRed = await this.network.newHeadlessWallet().ready()
		this.founderBlue = await this.network.newHeadlessWallet().ready()

		const { unit, error } = await this.genesis.sendBytes({
			toAddress: await this.deployer.getAddress(),
			amount: 1e9,
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		await this.network.witness(2)
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

		await this.network.witness(2)
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

		await this.network.witness(2)
		const balance = await this.founderBlue.getBalance()
		expect(balance.base.stable).to.be.equal(1e9)
	})

	it('Deploy 51 attack game AA', async () => {
		const { address, unit, error } = await this.deployer.deployAgent(path.join(__dirname, './agents/51_attack_game.agent'))

		expect(error).to.be.null
		expect(unit).to.be.validUnit
		expect(address).to.be.validAddress

		this.aaAddress = address

		await this.network.witness(2)
	})

	it('founderRed creates a team', async () => {
		const { unit, error } = await this.founderRed.sendData({
			toAddress: this.aaAddress,
			amount: 15000,
			payload: {
				create_team: true,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		await this.network.witness(4)

		const { response } = await this.founderRed.getAaResponse({ toUnit: unit })

		this.teamRedAsset = response.response.responseVars.team_asset
		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		expect(this.teamRedAsset).to.be.validBase64

		this.teamRed = await this.founderRed.getAddress()
	})

	it('founderBlue creates a team', async () => {
		const { unit, error } = await this.founderBlue.sendData({
			toAddress: this.aaAddress,
			amount: 15000,
			payload: {
				create_team: true,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		await this.network.witness(4)

		const { response } = await this.founderBlue.getAaResponse({ toUnit: unit })

		this.teamBlueAsset = response.response.responseVars.team_asset
		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		expect(this.teamBlueAsset).to.be.validBase64

		this.teamBlue = await this.founderBlue.getAddress()
	})

	it('founderRed contributes', async () => {
		const { unit, error } = await this.founderRed.sendData({
			toAddress: this.aaAddress,
			amount: 1e8,
			payload: {
				team: this.teamRed,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		await this.network.witness(4)

		const { response } = await this.founderRed.getAaResponse({ toUnit: unit })

		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		expect(response.updatedStateVars[this.aaAddress].winner.value).to.be.string(this.teamRed)

		const balance = await this.founderRed.getBalance()
		expect(balance[this.teamRedAsset].stable).to.be.equal(1e8)
	})

	it('founderBlue contributes x2', async () => {
		const { unit, error } = await this.founderBlue.sendData({
			toAddress: this.aaAddress,
			amount: 2e8,
			payload: {
				team: this.teamBlue,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		await this.network.witness(4)

		const { response } = await this.founderBlue.getAaResponse({ toUnit: unit })

		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		expect(response.updatedStateVars[this.aaAddress].winner.value).to.be.string(this.teamBlue)

		const balance = await this.founderBlue.getBalance()
		expect(balance[this.teamBlueAsset].stable).to.be.equal(2e8)
	})

	it('founderRed adds contributions', async () => {
		const { unit, error } = await this.founderRed.sendData({
			toAddress: this.aaAddress,
			amount: 2e8,
			payload: {
				team: this.teamRed,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		await this.network.witness(4)

		const { response } = await this.founderRed.getAaResponse({ toUnit: unit })

		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false
		expect(response.updatedStateVars[this.aaAddress].winner.value).to.be.string(this.teamRed)

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
		const { unit, error } = await this.founderRed.sendData({
			toAddress: this.aaAddress,
			amount: 10000,
			payload: {
				finish: true,
			},
		})

		expect(error).to.be.null
		expect(unit).to.be.validUnit

		await this.network.witness(4)

		const { response } = await this.founderRed.getAaResponse({ toUnit: unit })

		expect(response.bounced).to.be.false

		const vars = response.updatedStateVars[this.aaAddress]
		expect(vars.finished.value).to.be.equal(1)
		expect(vars.total.value).to.be.equal(500017130) // sum of all contributions plus AA bounce fees minus AA response fees

		this.prizeAmount = vars.total.value
	})

	it('founderRed collects the prize', async () => {
		const balanceBefore = await this.founderRed.getBalance()

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

		await this.network.witness(4)

		const { unitObj: collectingPrizeUnitObj, error: collectingPrizeError } = await this.founderBlue.getUnitInfo({ unit })
		expect(collectingPrizeError).to.be.null
		expect(collectingPrizeUnitObj.unit.headers_commission).to.be.a('number')
		expect(collectingPrizeUnitObj.unit.payload_commission).to.be.a('number')

		const balanceAfter = await this.founderRed.getBalance()

		const { response } = await this.founderRed.getAaResponse({ toUnit: unit })

		expect(response.response.error).to.be.undefined
		expect(response.bounced).to.be.false

		expect(balanceAfter[this.teamRedAsset].stable).to.be.equal(0)
		expect(balanceAfter[this.teamRedAsset].pending).to.be.equal(0)

		// header commissions from the parents of unit that triggered AA will be paid to the unit author
		// so we have to count them and add to founderRed expected balance
		const commissions = await Utils.countCommissionInUnits(this.founderRed, collectingPrizeUnitObj.unit.parent_units)
		expect(commissions.error).to.be.null
		expect(commissions.total_headers_commission).to.be.a('number')
		expect(commissions.total_payload_commission).to.be.a('number')

		const expectedBalance =
				this.prizeAmount
			+ balanceBefore.base.stable
			+ commissions.total_headers_commission
			- collectingPrizeUnitObj.unit.headers_commission
			- collectingPrizeUnitObj.unit.payload_commission
			- 10000 // bounce fee for last AA trigger

		expect(balanceAfter.base.stable).to.be.equal(expectedBalance)
	})

	after(async () => {
		// uncomment this line to pause test execution to get time for Obyte DAG explorer inspection
		// await Utils.sleep(3600 * 1000)
		this.network.stop()
	})
})
