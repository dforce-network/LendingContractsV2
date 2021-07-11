const { expect, util } = require("chai");
const { ethers } = require("hardhat");
const { utils, Contract } = require("ethers");
const {
  loadFixture,
  increaseBlock,
  fixtureDefault,
  deployRewardDistributor,
  deployMSDController,
  fixtureDeployOracle,
  deployiToken,
  fixtureDeployController,
  fixtureDeployStablecoinInterestRateModel,
} = require("../helpers/fixtures.js");
const { parseTokenAmount } = require("../helpers/utils.js");

const zeroAddress = ethers.constants.AddressZero;
const MAX = ethers.constants.MaxUint256;
const BASE = utils.parseEther("1");
const ZERO = ethers.BigNumber.from("0");
const blocksPerYear = ethers.BigNumber.from("2102400");

const abiCoder = new ethers.utils.AbiCoder();

let iUSDx, iUSDT, iWBTC, iETH, controller, interestRateModel;
let USDx, USDT, WBTC;
let users, user1, user2, user3, owner;
let lendingData;
let oracle;
let iTokenDecimals, iToken1Decimals;
let actualiTokenMintAmount, actualiToken1MintAmount;
let beforeController, mockController;
let beforeInterestRateModel, mockInterestRateModel;
let delta;
let xUSD, iMUSX, xUSDS, xEUR, iMEUX, xEURS;
let msdController;
let fixedInterestRateModel;

let rewardDistributor, newController, newInterestModelRate;
let timelock;
let newiToken;

describe("Governance Proposal Examination", function () {
  const rawMintAmount = ethers.BigNumber.from("500");

  async function init() {
    ({
      controller: controller,
      rewardDistributor: rewardDistributor,
      owner: owner,
      iToken0: iUSDx,
      underlying0: USDx,
      iToken1: iUSDT,
      underlying1: USDT,
      iToken2: iWBTC,
      underlying2: WBTC,
      iETH: iETH,
      interestRateModel: interestRateModel,
      accounts: users,
      flashloanExecutor: flashloanExecutor,
      flashloanExecutorFailure: flashloanExecutorFailure,
      priceOracle: oracle,
      lendingData: lendingData,
      fixedInterestRateModel: fixedInterestRateModel,
      xUSD: xUSD,
      iMUSX: iMUSX,
      xUSDS: xUSDS,
      xEUR: xEUR,
      iMEUX: iMEUX,
      xEURS: xEURS,
      msdController: msdController,
    } = await loadFixture(fixtureDefault));
    // [user1, user2, user3] = users;

    // Deploy the governance contract
    const Timelock = await ethers.getContractFactory("Timelock");
    timelock = await Timelock.deploy();
    await timelock.deployed();

    // Deploy a new iToken.
    newiToken = (
      await deployiToken(
        USDx.address,
        "New Tokne",
        "NT",
        controller.address,
        interestRateModel.address
      )
    ).iToken;

    await oracle.setPrices([newiToken.address], ["1000000000000000000"]);

    // Deploy a new controller
    newController = (await fixtureDeployController()).controller;

    // Deploy a new interest rate model
    newInterestModelRate = await fixtureDeployStablecoinInterestRateModel();
  }

  describe("Test iToken contract", function () {
    before("Transfer iToken owner to timelock contract", async function () {
      await init();
      // transfer ownership of iToken contract to governance contract
      await newiToken._setPendingOwner(timelock.address);

      await timelock.executeTransaction(
        newiToken.address,
        0,
        "_acceptOwner()",
        "0x"
      );
      let iTokenOwner = await newiToken.owner();
      expect(iTokenOwner).to.equal(timelock.address);

      // transfer ownership of controller contract to governance contract
      await controller._setPendingOwner(timelock.address);

      await timelock.executeTransaction(
        controller.address,
        0,
        "_acceptOwner()",
        "0x"
      );
      let controllerOwner = await controller.owner();
      expect(controllerOwner).to.equal(timelock.address);

      // transfer ownership of the reward contract to governance contract
      await rewardDistributor._setPendingOwner(timelock.address);

      await timelock.executeTransaction(
        rewardDistributor.address,
        0,
        "_acceptOwner()",
        "0x"
      );
      let rewardDistributorOwner = await rewardDistributor.owner();
      expect(rewardDistributorOwner).to.equal(timelock.address);
    });

    it("Set flashloan fee ratio and protocol fee ratio at the same time", async function () {
      // 1. Add new iToken to market
      let input = "500000000000000000";
      let beforeAllTokensLength = (await controller.getAlliTokens()).length;

      let addMarketData = abiCoder.encode(
        ["address", "uint256", "uint256", "uint256", "uint256", "uint256"],
        [newiToken.address, input, input, input, input, input]
      );

      // 2. Set flashloan fee ratio
      let newFlashloanFeeRatio = ethers.utils.parseEther("0.23");
      let flashloanFeeRatioData = abiCoder.encode(
        ["uint256"],
        [newFlashloanFeeRatio]
      );

      // 3. Set protocol fee ratio
      let newProtocolFeeRatio = ethers.utils.parseEther("0.45");
      let protocolFeeRatioData = abiCoder.encode(
        ["uint256"],
        [newProtocolFeeRatio]
      );

      // 4. Set new liquidation incentive
      let newLiquidationIncentive = "1400000000000000000";
      let liquidationIncentiveData = abiCoder.encode(
        ["uint256"],
        [newLiquidationIncentive]
      );

      // 5. Unpause reward distributor contract
      let initialBorrowSpeed = BASE;
      let initialSupplySpeed = BASE.mul(2);
      let unpausedData = abiCoder.encode(
        ["address[]", "uint256[]", "address[]", "uint256[]"],
        [
          [newiToken.address],
          [initialBorrowSpeed],
          [newiToken.address],
          [initialSupplySpeed],
        ]
      );

      // 6. Set new global speed
      let borrowSpeed = initialBorrowSpeed.div(2);
      let supplySpeed = initialSupplySpeed.div(2);

      let newGlobalSpeedData = abiCoder.encode(
        ["address[]", "uint256[]", "address[]", "uint256[]"],
        [[newiToken.address], [borrowSpeed], [newiToken.address], [supplySpeed]]
      );

      let targetsAddr = [
        controller.address,
        newiToken.address,
        newiToken.address,
        controller.address,
        rewardDistributor.address,
        rewardDistributor.address,
      ];
      let values = [0, 0, 0, 0, 0, 0];
      let signatures = [
        "_addMarket(address,uint256,uint256,uint256,uint256,uint256)",
        "_setNewFlashloanFeeRatio(uint256)",
        "_setNewProtocolFeeRatio(uint256)",
        "_setLiquidationIncentive(uint256)",
        "_unpause(address[],uint256[],address[],uint256[])",
        "_setDistributionSpeeds(address[],uint256[],address[],uint256[])",
      ];
      let datas = [
        addMarketData,
        flashloanFeeRatioData,
        protocolFeeRatioData,
        liquidationIncentiveData,
        unpausedData,
        newGlobalSpeedData,
      ];

      await timelock.executeTransactions(
        targetsAddr,
        values,
        signatures,
        datas
      );

      // Check for `_addMarket`
      let afterAllTokensLength = (await controller.getAlliTokens()).length;
      expect(beforeAllTokensLength + 1).to.equal(afterAllTokensLength);

      // Check for `_setNewFlashloanFeeRatio`
      let currentFlashloanFeeRatio = await newiToken.flashloanFeeRatio();
      expect(currentFlashloanFeeRatio).to.equal(newFlashloanFeeRatio);

      // Check for `_setNewProtocolFeeRatio`
      let currentProtocolFeeRatio = await newiToken.protocolFeeRatio();
      expect(newProtocolFeeRatio).to.equal(currentProtocolFeeRatio);

      // Check for `_setLiquidationIncentive`
      let currentLiquidationIncentive = await controller.liquidationIncentiveMantissa();
      expect(currentLiquidationIncentive).to.equal(newLiquidationIncentive);

      // Check for `_unpause`
      let hasPaused = await rewardDistributor.paused();
      expect(hasPaused).to.equal(false);

      // Check for `_setGlobalDistributionSpeed`
      let currentBorrowSpeed = await rewardDistributor.globalDistributionSpeed();
      let currentSupplySpeed = await rewardDistributor.globalDistributionSupplySpeed();
      expect(currentBorrowSpeed).to.equal(borrowSpeed);
      expect(currentSupplySpeed).to.equal(supplySpeed);
    });
  });
});
