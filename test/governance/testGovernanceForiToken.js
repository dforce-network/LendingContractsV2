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

describe("Governance Examination for iToken", function () {
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
      // transfer ownership to governance contract
      await newiToken._setPendingOwner(timelock.address);
      await timelock.executeTransaction(
        newiToken.address,
        0,
        "_acceptOwner()",
        "0x"
      );
      let owner = await newiToken.owner();
      expect(owner).to.equal(timelock.address);
    });

    it("Set new controller contract", async function () {
      let data = abiCoder.encode(["address"], [newController.address]);

      await timelock.executeTransaction(
        newiToken.address,
        0,
        "_setController(address)",
        data
      );

      let currentController = await newiToken.controller();

      expect(currentController).to.equal(newController.address);
    });

    it("Set new interest rate model contract", async function () {
      let data = abiCoder.encode(["address"], [newInterestModelRate.address]);

      await timelock.executeTransaction(
        newiToken.address,
        0,
        "_setInterestRateModel(address)",
        data
      );

      let currentInterestRate = await newiToken.interestRateModel();

      expect(currentInterestRate).to.equal(newInterestModelRate.address);
    });

    it("Set new reserve ratio", async function () {
      let newReserveRatio = ethers.utils.parseEther("0.1");
      let data = abiCoder.encode(["uint256"], [newReserveRatio]);

      await timelock.executeTransaction(
        newiToken.address,
        0,
        "_setNewReserveRatio(uint256)",
        data
      );

      let currentReserveRatio = await newiToken.reserveRatio();

      expect(currentReserveRatio).to.equal(newReserveRatio);
    });

    it("Set new flashloan fee ratio", async function () {
      let newFlashloanFeeRatio = ethers.utils.parseEther("0.23");
      let data = abiCoder.encode(["uint256"], [newFlashloanFeeRatio]);

      await timelock.executeTransaction(
        newiToken.address,
        0,
        "_setNewFlashloanFeeRatio(uint256)",
        data
      );

      let currentFlashloanFeeRatio = await newiToken.flashloanFeeRatio();

      expect(currentFlashloanFeeRatio).to.equal(newFlashloanFeeRatio);
    });

    it("Set new protocol fee ratio", async function () {
      let newProtocolFeeRatio = ethers.utils.parseEther("0.45");
      let data = abiCoder.encode(["uint256"], [newProtocolFeeRatio]);

      await timelock.executeTransaction(
        newiToken.address,
        0,
        "_setNewProtocolFeeRatio(uint256)",
        data
      );

      let currentProtocolFeeRatio = await newiToken.protocolFeeRatio();

      expect(currentProtocolFeeRatio).to.equal(newProtocolFeeRatio);
    });

    it("Set flashloan fee ratio and protocol fee ratio at the same time", async function () {
      let newFlashloanFeeRatio = ethers.utils.parseEther("0.67");
      let newProtocolFeeRatio = ethers.utils.parseEther("0.89");
      let flashloanFeeRatioData = abiCoder.encode(
        ["uint256"],
        [newFlashloanFeeRatio]
      );
      let protocolFeeRatioData = abiCoder.encode(
        ["uint256"],
        [newProtocolFeeRatio]
      );

      let targetsAddr = [newiToken.address, newiToken.address];
      let values = [0, 0];
      let signatures = [
        "_setNewFlashloanFeeRatio(uint256)",
        "_setNewProtocolFeeRatio(uint256)",
      ];
      let datas = [flashloanFeeRatioData, protocolFeeRatioData];

      await timelock.executeTransactions(
        targetsAddr,
        values,
        signatures,
        datas
      );

      let currentFlashloanFeeRatio = await newiToken.flashloanFeeRatio();
      let currentProtocolFeeRatio = await newiToken.protocolFeeRatio();
      // console.log("currentSpeed1", currentSpeed1.toString());

      expect(currentFlashloanFeeRatio).to.equal(newFlashloanFeeRatio);
      expect(newProtocolFeeRatio).to.equal(currentProtocolFeeRatio);
    });
  });
});
