const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  getBlock,
  getChainId,
  increaseBlock,
  increaseTime,
  fixtureDefault,
} = require("../helpers/fixtures.js");

const { checkContractData } = require("../helpers/contractData.js");
const { setOraclePrices } = require("../helpers/utils.js");

const BASE = ethers.utils.parseEther("1");
const maxAmount = ethers.constants.MaxUint256;

let iToken, iToken1, controller, interestRateModel;
let underlying, underlying1;
let users, user1, user2, user3, user4, owner;
let oracle;
let flashloanExecutor, flashloanExecutorFailure;
let iTokenDecimals, iToken1Decimals;
let actualiTokenMintAmount, actualiToken1MintAmount;

describe("iToken", async function () {
  const rawMintAmount = ethers.BigNumber.from("500");
  const rawBorrowAmout = ethers.BigNumber.from("300");
  const rawLiquidateAmount = ethers.BigNumber.from("90");
  const rawRapyAmount = ethers.BigNumber.from("20");
  let mintAmount = ethers.utils.parseEther("500");
  let redeemAmount = ethers.utils.parseEther("100");
  let borrowAmount = ethers.utils.parseEther("300");
  let repayAmount = ethers.utils.parseEther("50");
  let liquidateAmount = ethers.utils.parseEther("90");
  let flashloanAmount = ethers.utils.parseEther("100");

  async function init() {
    ({
      controller: controller,
      owner: owner,
      iToken5: iToken,
      underlying5: underlying,
      iToken1: iToken1,
      underlying1: underlying1,
      interestRateModel: interestRateModel,
      accounts: users,
      flashloanExecutor: flashloanExecutor,
      flashloanExecutorFailure: flashloanExecutorFailure,
      priceOracle: oracle,
    } = await loadFixture(fixtureDefault));
    [user1, user2, user3, user4] = users;
    await controller
      .connect(user1)
      .enterMarkets([iToken.address, iToken1.address]);
    await controller
      .connect(user2)
      .enterMarkets([iToken.address, iToken1.address]);
    await controller.connect(user3).enterMarkets([iToken1.address]);
    iTokenDecimals = await iToken.decimals();
    actualiTokenMintAmount = rawMintAmount.mul(
      ethers.BigNumber.from("10").pow(iTokenDecimals)
    );
    iToken1Decimals = await iToken1.decimals();
    actualiToken1MintAmount = rawMintAmount.mul(
      ethers.BigNumber.from("10").pow(iToken1Decimals)
    );
    await iToken.connect(user1).mint(user1.address, actualiTokenMintAmount);
    await iToken.connect(user2).mint(user2.address, actualiTokenMintAmount);
    await iToken1.connect(user1).mint(user1.address, actualiToken1MintAmount);
    await iToken1.connect(user2).mint(user2.address, actualiToken1MintAmount);
    await iToken1.connect(user3).mint(user3.address, actualiToken1MintAmount);
  }

  describe("Test new function: mintAndEnterMarket", async function () {
    it("When mint iToken, use it as collateral at the same time", async function () {
      // Initialize environments.
      await init();
      // Before minting, user's equity is zero.
      let beforeMintUserEquity = await controller.calcAccountEquity(user4.address);
      expect(beforeMintUserEquity[0]).to.equal(0);

      await expect(() =>
        iToken.connect(user4).mintAndEnterMarket(user4.address, mintAmount)
      ).to.changeTokenBalance(underlying, user4, mintAmount.mul(-1));

      let afterMintUserEquity = await controller.calcAccountEquity(user4.address);
      expect(afterMintUserEquity[0]).to.gt(0);
    });
  });
});
