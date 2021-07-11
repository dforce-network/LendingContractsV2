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
} = require("../helpers/fixtures.js");
const { parseTokenAmount, setOraclePrices } = require("../helpers/utils.js");

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

let rewardDistributor;
let timelock;
let newiToken;

describe("Governance Examination for Reward Distributor", function () {
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

    await setOraclePrices(oracle, [newiToken], [1]);
  }

  describe("Test Reward Distribution contract", function () {
    before(
      "Transfer Reward Distribution owner to timelock contract",
      async function () {
        await init();
        // transfer ownership to governance contract
        await rewardDistributor._setPendingOwner(timelock.address);
        await timelock.executeTransaction(
          rewardDistributor.address,
          0,
          "_acceptOwner()",
          "0x"
        );
        let owner = await rewardDistributor.owner();
        expect(owner).to.equal(timelock.address);
      }
    );

    it("Set new reward token", async function () {
      let data = abiCoder.encode(["address"], [newiToken.address]);

      await timelock.executeTransaction(
        rewardDistributor.address,
        0,
        "_setRewardToken(address)",
        data
      );

      let newRewardToken = await rewardDistributor.rewardToken();

      expect(newRewardToken).to.equal(newiToken.address);
    });

    it("Set unpause", async function () {
      let borrowsSpeed = BASE;
      let supplySpeed = BASE.mul(2);
      let data = abiCoder.encode(
        ["address[]", "uint256[]", "address[]", "uint256[]"],
        [[iUSDx.address], [borrowsSpeed], [iUSDT.address], [supplySpeed]]
      );

      await timelock.executeTransaction(
        rewardDistributor.address,
        0,
        "_unpause(address[],uint256[],address[],uint256[])",
        data
      );

      let hasPaused = await rewardDistributor.paused();
      let currentBorrowSpeed = await rewardDistributor.globalDistributionSpeed();
      let currentSupplySpeed = await rewardDistributor.globalDistributionSupplySpeed();

      expect(hasPaused).to.equal(false);
      expect(currentBorrowSpeed).to.equal(borrowsSpeed);
      expect(currentSupplySpeed).to.equal(supplySpeed);
    });

    it("Set distributor speeds", async function () {
      let borrowSpeed = BASE.div(2);
      let supplySpeed = BASE;
      let data = abiCoder.encode(
        ["address[]", "uint256[]", "address[]", "uint256[]"],
        [[iUSDx.address], [borrowSpeed], [iUSDT.address], [supplySpeed]]
      );

      await timelock.executeTransaction(
        rewardDistributor.address,
        0,
        "_setDistributionSpeeds(address[],uint256[],address[],uint256[])",
        data
      );

      let currentBorrowSpeed = await rewardDistributor.globalDistributionSpeed();
      let currentSupplySpeed = await rewardDistributor.globalDistributionSupplySpeed();

      expect(currentBorrowSpeed).to.equal(borrowSpeed);
      expect(currentSupplySpeed).to.equal(supplySpeed);
    });

    it.skip("Set distributor factor", async function () {
      let distributionFactors = BASE.div(4);
      let data = abiCoder.encode(
        ["address[]", "uint256[]"],
        [[iUSDx.address], [distributionFactors]]
      );

      await timelock.executeTransaction(
        rewardDistributor.address,
        0,
        "_setDistributionFactors(address[],uint256[])",
        data
      );

      let currentSpeed = await rewardDistributor.distributionFactorMantissa(
        iUSDx.address
      );

      expect(currentSpeed).to.equal(distributionFactors);
    });

    it.skip("Set global distribution speed and distribution factiors at the same time", async function () {
      let borrowSpeed = BASE.div(2);
      let supplySpeed = BASE;
      let globalDistributionSpeedData = abiCoder.encode(
        ["uint256", "uint256"],
        [borrowSpeed, supplySpeed]
      );

      let distributionFactors = BASE.div(10);
      let distributionFactorsData = abiCoder.encode(
        ["address[]", "uint256[]"],
        [[iUSDx.address], [distributionFactors]]
      );

      let targetsAddr = [rewardDistributor.address, rewardDistributor.address];
      let values = [0, 0];
      let signatures = [
        "_setGlobalDistributionSpeeds(uint256,uint256)",
        "_setDistributionFactors(address[],uint256[])",
      ];
      let datas = [globalDistributionSpeedData, distributionFactorsData];

      await timelock.executeTransactions(
        targetsAddr,
        values,
        signatures,
        datas
      );

      let currentDistributionFactors = await rewardDistributor.distributionFactorMantissa(
        iUSDx.address
      );
      let currentBorrowSpeed = await rewardDistributor.globalDistributionSpeed();
      let currentSupplySpeed = await rewardDistributor.globalDistributionSupplySpeed();
      // console.log("currentSpeed1", currentSpeed1.toString());

      expect(currentDistributionFactors).to.equal(distributionFactors);
      expect(currentBorrowSpeed).to.equal(borrowSpeed);
      expect(currentSupplySpeed).to.equal(supplySpeed);
    });

    it("Set pause", async function () {
      let data = "0x";

      await timelock.executeTransaction(
        rewardDistributor.address,
        0,
        "_pause()",
        data
      );

      let hasPaused = await rewardDistributor.paused();
      let currentSpeed = await rewardDistributor.globalDistributionSpeed();

      expect(hasPaused).to.equal(true);
      expect(currentSpeed).to.equal(0);
    });
  });
});
