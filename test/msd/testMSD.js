const { expect } = require("chai");
const { utils, BigNumber } = require("ethers");
const { fromRpcSig } = require("ethereumjs-util");
const ethSigUtil = require("eth-sig-util");
const Wallet = require("ethereumjs-wallet").default;

const { EIP712Domain, domainSeparator } = require("../helpers/eip712");

const Permit = [
  { name: "owner", type: "address" },
  { name: "spender", type: "address" },
  { name: "chainId", type: "uint256" },
  { name: "value", type: "uint256" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
];

const {
  parseTokenAmount,
  formatTokenAmount,
  verifyOnlyOwner,
  setOraclePrices,
  deployProxy,
  rmul,
  rdiv,
  msdEquityPerBlock,
} = require("../helpers/utils.js");

const {
  deployFixedInterestRateModel,
  deployMSDController,
  loadFixture,
  fixtureDefault,
  getChainId,
  getiTokenCurrentData,
  increaseBlock,
  increaseTime,
} = require("../helpers/fixtures.js");

const { getBorrowBalanceCurrent } = require("../helpers/currentData.js");
const BASE = ethers.utils.parseEther("1");
const AddressZero = ethers.constants.AddressZero;

describe("Fixed Rate Interest Model", function () {
  let interestRateModel, iMUSX, xUSDS;
  let owner, accounts, user1;
  let oldBorrowRate, borrowRate, oldSupplyRate, supplyRate;
  let ixUSDSigner, xUSDSSigner;

  before(async function () {
    ({
      iMUSX,
      xUSDS,
      owner,
      accounts,
      fixedInterestRateModel: interestRateModel,
    } = await loadFixture(fixtureDefault));

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [iMUSX.address],
    });

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [xUSDS.address],
    });

    ixUSDSigner = await ethers.provider.getSigner(iMUSX.address);
    xUSDSSigner = await ethers.provider.getSigner(xUSDS.address);

    // 0.08 * 10 ** 18 / 2102400
    borrowRate = BigNumber.from(38051750380);

    // 0.06 * 10 ** 18 / 2102400
    supplyRate = BigNumber.from(28538812785);

    [user1] = accounts;

    oldBorrowRate = await interestRateModel.borrowRatesPerBlock(iMUSX.address);
    oldSupplyRate = await interestRateModel.supplyRatesPerBlock(xUSDS.address);
  });

  after(async function () {
    await hre.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [iMUSX.address],
    });

    await hre.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [xUSDS.address],
    });
  });

  beforeEach(async function () {
    ({
      iMUSX,
      xUSDS,
      owner,
      accounts,
      fixedInterestRateModel: interestRateModel,
    } = await loadFixture(fixtureDefault));
  });

  it("Should only allow owner to set borrow rate", async function () {
    await verifyOnlyOwner(
      interestRateModel, //contract
      "_setBorrowRate", // method
      [iMUSX.address, borrowRate], //args
      owner, // owner
      user1, // non-owner
      "BorrowRateSet", // ownerEvent
      [iMUSX.address, borrowRate], // ownerEventArgs
      // ownerChecks
      async () => {
        expect(
          await interestRateModel.connect(ixUSDSigner).getBorrowRate(0, 0, 0)
        ).to.equal(borrowRate);
      },
      // nonownerChecks
      async () => {
        expect(
          await interestRateModel.connect(ixUSDSigner).getBorrowRate(0, 0, 0)
        ).to.equal(oldBorrowRate);
      }
    );
  });

  it("Should only allow owner to set borrow rates", async function () {
    await verifyOnlyOwner(
      interestRateModel, //contract
      "_setBorrowRates", // method
      [[iMUSX.address], [borrowRate]], //args
      owner, // owner
      user1, // non-owner
      "BorrowRateSet", // ownerEvent
      [iMUSX.address, borrowRate], // ownerEventArgs
      // ownerChecks
      async () => {
        expect(
          await interestRateModel.connect(ixUSDSigner).getBorrowRate(0, 0, 0)
        ).to.equal(borrowRate);
      },
      // nonownerChecks
      async () => {
        expect(
          await interestRateModel.connect(ixUSDSigner).getBorrowRate(0, 0, 0)
        ).to.equal(oldBorrowRate);
      }
    );
  });

  it("Should only allow owner set supply rate", async function () {
    await verifyOnlyOwner(
      interestRateModel, //contract
      "_setSupplyRate", // method
      [xUSDS.address, supplyRate], //args
      owner, // owner
      user1, // non-owner
      "SupplyRateSet", // ownerEvent
      [xUSDS.address, supplyRate], // ownerEventArgs
      // ownerChecks
      async () => {
        expect(
          await interestRateModel.connect(xUSDSSigner).getSupplyRate(0, 0, 0, 0)
        ).to.equal(supplyRate);
      },
      // nonownerChecks
      async () => {
        expect(
          await interestRateModel.connect(xUSDSSigner).getSupplyRate(0, 0, 0, 0)
        ).to.equal(oldSupplyRate);
      }
    );
  });

  it("Should only allow owner set supply rates", async function () {
    await verifyOnlyOwner(
      interestRateModel, //contract
      "_setSupplyRates", // method
      [[xUSDS.address], [supplyRate]], //args
      owner, // owner
      user1, // non-owner
      "SupplyRateSet", // ownerEvent
      [xUSDS.address, supplyRate], // ownerEventArgs
      // ownerChecks
      async () => {
        expect(
          await interestRateModel.connect(xUSDSSigner).getSupplyRate(0, 0, 0, 0)
        ).to.equal(supplyRate);
      },
      // nonownerChecks
      async () => {
        expect(
          await interestRateModel.connect(xUSDSSigner).getSupplyRate(0, 0, 0, 0)
        ).to.equal(oldSupplyRate);
      }
    );
  });

  it("Should not allow to set rates > ratePerBlockMax", async function () {
    let invalidRate = utils.parseEther("0.001").add(1);

    await expect(
      interestRateModel._setSupplyRate(xUSDS.address, invalidRate)
    ).to.be.revertedWith("Supply rate invalid");

    await expect(
      interestRateModel._setBorrowRate(xUSDS.address, invalidRate)
    ).to.be.revertedWith("Borrow rate invalid");
  });
});

describe("MSD", function () {
  let xUSD, msdController;
  let priceOracle;
  let amount;
  let owner, accounts, user1;
  let ownerAddr, user1Addr, user2Addr;

  before(async function () {
    ({ xUSD, owner, accounts, msdController } = await loadFixture(
      fixtureDefault
    ));

    amount = await parseTokenAmount(xUSD, 1000);
    [user1, user2] = accounts;

    ownerAddr = await owner.getAddress();
    [user1Addr, user2Addr] = await Promise.all(
      [user1, user2].map(async (u) => await u.getAddress())
    );
  });

  it("Should only allow owner to add minter", async function () {
    await verifyOnlyOwner(
      xUSD, //contract
      "_addMinter", // method
      [ownerAddr], //args
      owner, // owner
      user1, // non-owner
      "MinterAdded", // ownerEvent
      [ownerAddr] // ownerEventArgs
    );

    // Add again should be okay but no event
    await verifyOnlyOwner(
      xUSD, //contract
      "_addMinter", // method
      [ownerAddr], //args
      owner, // owner
      user1 // non-owner
    );
  });

  it("Should revert when remove minter is zero address.", async function () {
    await expect(xUSD._removeMinter(AddressZero)).to.be.revertedWith(
      "_removeMinter: _minter the zero address"
    );
  });

  it("Should only allow owner to remove minter", async function () {
    await verifyOnlyOwner(
      xUSD, //contract
      "_removeMinter", // method
      [ownerAddr], //args
      owner, // owner
      user1, // non-owner
      "MinterRemoved", // ownerEvent
      [ownerAddr] // ownerEventArgs
    );

    // Remove again should also be okay but no event
    await verifyOnlyOwner(
      xUSD, //contract
      "_removeMinter", // method
      [ownerAddr], //args
      owner, // owner
      user1 // non-owner
    );
  });

  it("Should only be minted by minter", async function () {
    await xUSD._addMinter(ownerAddr);

    // now owner is a minter
    await expect(() => xUSD.mint(user1Addr, amount)).to.changeTokenBalance(
      xUSD,
      user1,
      amount
    );

    await expect(
      xUSD.connect(user1).mint(user1Addr, amount)
    ).to.be.revertedWith("onlyMinter: caller is not minter");
  });

  it("Should not add the zero address as the new minter", async function () {
    await expect(xUSD._addMinter(AddressZero)).to.be.revertedWith(
      "_addMinter: _minter the zero address"
    );
  });

  it("Can be burned", async function () {
    let amount = await parseTokenAmount(xUSD, 100);

    let totalSupplyBefore = await xUSD.totalSupply();

    await expect(() =>
      xUSD.connect(user1).burn(user1Addr, amount)
    ).to.changeTokenBalance(xUSD, user1, amount.mul(-1));

    let totalSupplyAfter = await xUSD.totalSupply();
    expect(totalSupplyBefore.sub(totalSupplyAfter)).to.equal(amount);
  });

  it("Can be burned by others if approved", async function () {
    let amount = await parseTokenAmount(xUSD, 100);

    await xUSD.connect(user1).approve(user2Addr, amount);
    await expect(() =>
      xUSD.connect(user2).burn(user1Addr, amount)
    ).to.changeTokenBalance(xUSD, user1, amount.mul(-1));
  });

  it("Should be able to get minters", async function () {
    // MSDController and newly added owner
    expect(await xUSD.getMinters()).to.have.length(2);
    expect(await xUSD.getMinters()).to.have.members([
      ownerAddr,
      msdController.address,
    ]);
  });
});

describe("iMSD", function () {
  let iToken0, iToken1, xUSD, iMUSX, controller, priceOracle, interestRateModel;
  let amount;
  let owner, borrower, payer, accounts;
  let borrowerAddr, payerAddr;

  before(async function () {
    ({
      xUSD,
      iMUSX,
      owner,
      accounts,
      iToken0,
      iToken1,
      controller,
      priceOracle,
      fixedInterestRateModel: interestRateModel,
    } = await loadFixture(fixtureDefault));

    await xUSD._addMinter(iMUSX.address);

    amount = await parseTokenAmount(xUSD, 1000);
    [borrower, payer] = accounts;

    borrowerAddr = await borrower.getAddress();
    payerAddr = await payer.getAddress();

    // Approve -1
    await xUSD
      .connect(borrower)
      .approve(iMUSX.address, ethers.constants.MaxUint256);

    await xUSD
      .connect(payer)
      .approve(iMUSX.address, ethers.constants.MaxUint256);
  });

  it("Should not be able to borrow with no collateral", async function () {
    await expect(iMUSX.connect(borrower).borrow(amount)).to.be.revertedWith(
      "Account has some shortfall"
    );
  });

  it("Should be able to borrow after supply some collateral by mint some underlying", async function () {
    await iToken0
      .connect(borrower)
      .mint(borrowerAddr, await parseTokenAmount(iToken0, 10000));
    await controller.connect(borrower).enterMarkets([iToken0.address]);

    // Initial total supply should be 0
    let totalSupply = await xUSD.totalSupply();
    expect(totalSupply).to.equal(0);

    await expect(() =>
      iMUSX.connect(borrower).borrow(amount)
    ).to.changeTokenBalance(xUSD, borrower, amount);

    // Now the total supply should be the borrow amount
    totalSupply = await xUSD.totalSupply();
    expect(totalSupply).to.equal(amount);
  });

  it("Should be able to repay borrow", async function () {
    let borrowBalanceCurrentNoRepay = await getBorrowBalanceCurrent(
      iMUSX,
      borrowerAddr,
      1
    );

    await expect(() =>
      iMUSX.connect(borrower).repayBorrow(amount)
    ).to.changeTokenBalance(xUSD, borrower, amount.mul(-1));

    let borrowBalanceCurrentRepaid = await iMUSX.borrowBalanceStored(
      borrowerAddr
    );
    expect(borrowBalanceCurrentNoRepay.sub(amount)).to.equal(
      borrowBalanceCurrentRepaid
    );

    // let borrowBalance = await iMUSX.borrowBalanceStored(borrowerAddr);
    // console.log(await formatTokenAmount(iMUSX, borrowBalance));

    // Repayed xUSD should be burned
    let underlying = await xUSD.balanceOf(iMUSX.address);
    expect(underlying).to.equal(0);

    // Now total supply should be 0
    let totalSupply = await xUSD.totalSupply();
    expect(totalSupply).to.equal(0);
  });

  it("Should be able to repay borrow behalf", async function () {
    await iMUSX.connect(borrower).borrow(amount);
    await xUSD.connect(borrower).transfer(payerAddr, amount);

    let borrowBalanceCurrentBefore = await getBorrowBalanceCurrent(
      iMUSX,
      borrowerAddr,
      1
    );

    await expect(() =>
      iMUSX.connect(payer).repayBorrowBehalf(borrowerAddr, amount)
    ).to.changeTokenBalance(xUSD, payer, amount.mul(-1));

    let borrowBalanceCurrentAfter = await iMUSX.borrowBalanceStored(
      borrowerAddr
    );
    expect(borrowBalanceCurrentBefore.sub(amount)).to.equal(
      borrowBalanceCurrentAfter
    );

    // Repayed xUSD should be burned
    let underlying = await xUSD.balanceOf(iMUSX.address);
    expect(underlying).to.equal(0);

    // Now total supply should be 0
    let totalSupply = await xUSD.totalSupply();
    expect(totalSupply).to.equal(0);
  });

  it("Should be able to liquidate borrow", async function () {
    let repayAmount = amount.div(10);

    await iMUSX.connect(borrower).borrow(amount);

    // iMUSX price increase will cause a shortfall
    await setOraclePrices(priceOracle, [iMUSX], [10]);

    // Payer does not hold any xUSD now, transfer some
    await xUSD.connect(borrower).transfer(payerAddr, repayAmount);

    await expect(() =>
      iMUSX
        .connect(payer)
        .liquidateBorrow(borrowerAddr, repayAmount, iToken0.address)
    ).to.changeTokenBalance(xUSD, payer, repayAmount.mul(-1));

    // let borrowBalance = await iMUSX.borrowBalanceStored(borrowerAddr);
    // console.log(await formatTokenAmount(iMUSX, borrowBalance));

    // Liquidate incentive is 10%
    let seizedCollateral = await iToken0.balanceOf(payerAddr);
    let expectSeized = (
      await parseTokenAmount(iMUSX, await formatTokenAmount(iMUSX, repayAmount))
    ).mul(11);
    expect(seizedCollateral).to.equal(expectSeized);

    // restore iMUSX price
    await setOraclePrices(priceOracle, [iMUSX], [1]);
  });

  it("Should not be able to seize", async function () {
    await iToken1
      .connect(borrower)
      .mint(borrowerAddr, await parseTokenAmount(iToken1, 1000));
    let borrowAmount = await parseTokenAmount(iToken1, 1000);
    let repayAmount = borrowAmount.div(10);

    await iToken1.connect(borrower).borrow(borrowAmount);

    // iMUSX price increase will cause a shortfall
    await setOraclePrices(priceOracle, [iMUSX], [10]);

    // Try to seize iMUSX
    await expect(
      iToken1
        .connect(payer)
        .liquidateBorrow(borrowerAddr, repayAmount, iMUSX.address)
    ).to.revertedWith("iMSD Token can not be seized");

    // Try seize with iMUSX itself
    await expect(
      iMUSX
        .connect(payer)
        .liquidateBorrow(borrowerAddr, repayAmount, iMUSX.address)
    ).to.revertedWith("iMSD Token can not be seized");
  });

  it("Should be able to get borrowBalanceCurrent", async function () {
    let expected = await getBorrowBalanceCurrent(iMUSX, borrowerAddr, 1);

    // Do not use callStatic here, interest accumulation are based on blocks
    await iMUSX.borrowBalanceCurrent(borrowerAddr);
    let actual = await iMUSX.borrowBalanceStored(borrowerAddr);

    expect(actual).to.equal(expected);
  });

  it("Should be able to get totalBorrowsCurrent", async function () {
    let { totalBorrows: expected } = await getiTokenCurrentData(iMUSX, 1);

    // Do not use callStatic here, interest accumulation are based on blocks
    await iMUSX.totalBorrowsCurrent();
    let actual = await iMUSX.totalBorrows();

    expect(actual).to.equal(expected);
  });

  it("Should be able to get borrowRatePerBlock", async function () {
    let borrowRate = await interestRateModel.borrowRatesPerBlock(iMUSX.address);
    expect(await iMUSX.borrowRatePerBlock()).to.equal(borrowRate);
  });

  it("Should not be able to set new reserve ratio", async function () {
    let newReserveRatio = ethers.utils.parseEther("0.8");
    await expect(iMUSX._setNewReserveRatio(newReserveRatio)).to.be.revertedWith(
      "Reserve Ratio of iMSD Token can not be changed"
    );
  });

  it("Should revert when sets new reserve ratio by a user account", async function () {
    let newReserveRatio = ethers.utils.parseEther("0.8");
    await expect(
      iMUSX.connect(accounts[1])._setNewReserveRatio(newReserveRatio)
    ).to.be.revertedWith("onlyOwner: caller is not the owner");
  });

  it("Should set a new msdController", async function () {
    // Deploy a new msdController
    let newMSDController = await deployMSDController();
    await iMUSX._setMSDController(newMSDController.address);
    let currentMSDController = await iMUSX.msdController();
    expect(currentMSDController).to.equal(newMSDController.address);
  });

  it("Should not be set new msdController by a user account", async function () {
    let newMSDController = await deployMSDController();
    await expect(
      iMUSX.connect(accounts[1])._setMSDController(newMSDController.address)
    ).to.be.revertedWith("onlyOwner: caller is not the owner");
  });

  it("Should revert when set a non-msdController", async function () {
    await expect(iMUSX._setMSDController(iToken0.address)).to.be.reverted;
  });
});

describe("MSD Integration", function () {
  let iToken0,
    iToken1,
    xUSD,
    iMUSX,
    xUSDS,
    controller,
    priceOracle,
    interestRateModel;
  let amount;
  let owner, borrower, payer, accounts;
  let borrowerAddr, payerAddr;
  let msdController;

  async function calculateExchangeRate(blockDelta) {
    let exchangeRate = await xUSDS.exchangeRateStored();
    let simpleInterestFactor = (
      await interestRateModel.supplyRatesPerBlock(xUSDS.address)
    ).mul(blockDelta);

    exchangeRate = exchangeRate.add(rmul(exchangeRate, simpleInterestFactor));

    return exchangeRate;
  }

  before(async function () {
    ({
      xUSD,
      iMUSX,
      xUSDS,
      owner,
      accounts,
      iToken0,
      iToken1,
      controller,
      priceOracle,
      fixedInterestRateModel: interestRateModel,
      msdController,
    } = await loadFixture(fixtureDefault));

    amount = await parseTokenAmount(xUSD, 1000);
    [borrower, payer] = accounts;

    borrowerAddr = await borrower.getAddress();
    payerAddr = await payer.getAddress();

    // Approve -1
    await xUSD
      .connect(borrower)
      .approve(iMUSX.address, ethers.constants.MaxUint256);

    await xUSD
      .connect(payer)
      .approve(iMUSX.address, ethers.constants.MaxUint256);

    await controller.connect(borrower).enterMarkets([iToken0.address]);

    // Supply token0 to borrow xUSD
    await iToken0
      .connect(borrower)
      .mint(borrowerAddr, await parseTokenAmount(iToken0, 10000));
    iMUSX.connect(borrower).borrow(amount);

    await xUSD
      .connect(borrower)
      .approve(xUSDS.address, ethers.constants.MaxUint256);

    // await xUSDS
    //   .connect(borrower)
    //   .approve(xUSDS.address, ethers.constants.MaxUint256);
  });

  describe("MSDS", function () {
    it("Should be able to mint", async function () {
      await expect(() =>
        xUSDS.connect(borrower).mint(borrowerAddr, amount)
      ).to.changeTokenBalances(
        xUSDS,
        [borrower],
        // The first interest accrual, no block delta yet
        [rdiv(amount, await xUSDS.exchangeRateStored())]
      );
    });

    it("Should be able to redeem", async function () {
      await expect(() =>
        xUSDS.connect(borrower).redeem(borrowerAddr, amount)
      ).to.changeTokenBalances(
        xUSD,
        [borrower],
        [rmul(amount, await calculateExchangeRate(1))]
      );
    });

    it("Should be able to redeemUnderlying", async function () {
      await xUSDS.connect(borrower).mint(borrowerAddr, amount);
      await expect(() =>
        xUSDS.connect(borrower).redeemUnderlying(borrowerAddr, amount)
      ).to.changeTokenBalances(xUSD, [borrower], [amount]);
    });

    it("Check current underlying balance", async function () {
      let beforeBalance = await xUSDS.balanceOf(borrowerAddr);

      // mine some more blocks.
      await increaseBlock(100);
      await xUSDS.balanceOfUnderlyingCurrent(borrowerAddr);
      let currentExchangeRate = await xUSDS.exchangeRateStored();
      let afterxUSDSBalance = await xUSDS.balanceOfUnderlyingStored(
        borrowerAddr
      );

      expect(beforeBalance.mul(currentExchangeRate)).to.equal(
        afterxUSDSBalance
      );
    });

    it("Should supply/redeem when supply rate is 0", async function () {
      let user1 = accounts[0];
      let mintAmount = ethers.utils.parseEther("100");
      let withdrawAmount = ethers.utils.parseEther("50");

      // Records the original supply rate to restore data at the end.
      let originalSupplyRate = await xUSDS.supplyRatePerBlock();
      // Sets supply rate of MSDS as 0.
      await interestRateModel._setSupplyRate(xUSDS.address, 0);
      let supplyRate = await xUSDS.supplyRatePerBlock();
      expect(supplyRate).to.equal(0);

      // When supply rate is 0, records the totalSupply.
      let beforeTotalSupply = await xUSDS.totalSupply();
      let beforeExchangeRate = await xUSDS.callStatic.exchangeRateCurrent();

      // Try to mint
      await xUSDS.connect(user1).mint(user1.address, mintAmount);
      let afterTotalSupply = await xUSDS.totalSupply();
      // console.log("afterTotalSupply", afterTotalSupply.toString());
      // console.log("changed", (afterTotalSupply.sub(beforeTotalSupply)).toString());
      let afterExchangeRate = await xUSDS.callStatic.exchangeRateCurrent();

      expect(afterTotalSupply.sub(beforeTotalSupply)).to.equal(
        mintAmount.mul(BASE).div(beforeExchangeRate)
      );
      expect(afterExchangeRate).to.equal(beforeExchangeRate);

      // Try to redeem
      beforeTotalSupply = await xUSDS.totalSupply();
      beforeExchangeRate = await xUSDS.callStatic.exchangeRateCurrent();
      await xUSDS.connect(user1).redeem(user1.address, withdrawAmount);

      afterTotalSupply = await xUSDS.totalSupply();
      afterExchangeRate = await xUSDS.callStatic.exchangeRateCurrent();

      expect(beforeTotalSupply.sub(afterTotalSupply)).to.equal(withdrawAmount);
      expect(afterExchangeRate).to.equal(beforeExchangeRate);

      // Restore supply rate
      await interestRateModel._setSupplyRate(xUSDS.address, originalSupplyRate);
    });

    it("Check current exchange rate", async function () {
      // update exchange rate
      await xUSDS.exchangeRateCurrent();

      let mintBlocks = 100;
      let expectExchangeRate = await calculateExchangeRate(mintBlocks);

      await increaseBlock(mintBlocks - 1);
      await xUSDS.exchangeRateCurrent();
      let afterExchangeRate = await xUSDS.exchangeRateStored();

      expect(afterExchangeRate).to.equal(expectExchangeRate);
    });

    it("Should only allow owner to _setInterestRateModel", async function () {
      let newInterestModel = (await deployFixedInterestRateModel()).address;
      let oldInterestModel = await xUSDS.interestRateModel();

      await verifyOnlyOwner(
        xUSDS, //contract
        "_setInterestRateModel", // method
        [newInterestModel], //args
        owner, // owner
        borrower, // non-owner
        "NewInterestRateModel", // ownerEvent
        [oldInterestModel, newInterestModel], // ownerEventArgs
        // ownerChecks
        async () => {
          expect(await xUSDS.interestRateModel()).to.equal(newInterestModel);
        },
        // nonownerChecks
        async () => {
          expect(await xUSDS.interestRateModel()).to.equal(oldInterestModel);
        }
      );

      // Restore it back
      await xUSDS._setInterestRateModel(oldInterestModel);
    });

    it("Should revert when set a non interest model", async function () {
      //
      await expect(xUSDS._setInterestRateModel(iToken0.address)).to.be.reverted;
    });

    it("Should be able to get supplyRatePerBlock", async function () {
      let supplyRate = await interestRateModel.supplyRatesPerBlock(
        xUSDS.address
      );

      expect(await xUSDS.supplyRatePerBlock()).to.equal(supplyRate);
    });

    it("Should set a new msdController", async function () {
      // Deploy a new msdController
      let msdControllerAddress = xUSDS.msdController();
      let newMSDController = await deployMSDController();
      await xUSDS._setMSDController(newMSDController.address);
      let currentMSDController = await xUSDS.msdController();
      expect(currentMSDController).to.equal(newMSDController.address);

      // Restore old MSDController
      await xUSDS._setMSDController(msdControllerAddress);
    });

    it("Should not be set new msdController by a user account", async function () {
      let newMSDController = await deployMSDController();
      await expect(
        xUSDS.connect(accounts[0])._setMSDController(newMSDController.address)
      ).to.be.revertedWith("onlyOwner: caller is not the owner");
    });

    it("Should revert when set a non-msdController", async function () {
      await expect(xUSDS._setMSDController(iToken0.address)).to.be.reverted;
    });

    it("Check stored underlying balance", async function () {
      let beforexUSDSBalance = await xUSDS.balanceOfUnderlyingStored(
        borrowerAddr
      );
      // mine some more blocks.
      await increaseBlock(100);
      let afterxUSDSBalance = await xUSDS.balanceOfUnderlyingStored(
        borrowerAddr
      );
      expect(beforexUSDSBalance).to.equal(afterxUSDSBalance);
    });
  });

  describe("MSD Controller", function () {
    it("Should be able to get minters of a MSD token", async function () {
      // minters of address(0) should be a empty list
      expect(
        await msdController.getMSDMinters(ethers.constants.AddressZero)
      ).to.have.length(0);

      expect(await msdController.getMSDMinters(xUSD.address)).to.have.members([
        iMUSX.address,
        xUSDS.address,
      ]);
    });

    describe("Reserves", function () {
      it("Should have some surplus", async function () {
        // Now calcEquity() will call updateInterest() so equity should > 0
        let { 0: equity, 1: debt } = await msdController.callStatic.calcEquity(
          xUSD.address
        );

        expect(equity).to.gt(0);
      });

      it("Should not withdraw too much reserve", async function () {
        let withdrawAmount = ethers.utils.parseEther("100");
        let { 0: equity, 1: debt } = await msdController.callStatic.calcEquity(
          xUSD.address
        );
        expect(withdrawAmount).to.gt(equity);

        await expect(
          msdController._withdrawReserves(xUSD.address, withdrawAmount)
        ).to.be.revertedWith("Token do not have enough reserve");
      });

      it("iMSD should have no reserve or cash", async function () {
        let reserve = await iMUSX.totalReserves();
        // console.log(reserve.toString());
        expect(reserve).to.equal(0);

        await expect(iMUSX._withdrawReserves(1)).to.be.revertedWith(
          "_withdrawReserves: Invalid withdraw amount and do not have enough cash!"
        );

        let cash = await iMUSX.getCash();
        // console.log(cash.toString());
        expect(cash).to.equal(0);
      });

      it("MSDController should be able to withdraw reserve", async function () {
        let { 0: equity, 1: debt } = await msdController.callStatic.calcEquity(
          xUSD.address
        );

        let xUSDEquityPerBlock = await msdEquityPerBlock(iMUSX, xUSDS);
        // console.log(xUSDEquityPerBlock.toString());

        // Calulate the exact amount of equity by forwarding 1 block
        equity = equity.add(xUSDEquityPerBlock);
        // console.log(equity.toString());

        // Withdraw all
        await expect(() =>
          msdController._withdrawReserves(xUSD.address, equity)
        ).to.changeTokenBalance(xUSD, owner, equity);

        // Should be no reserve left as there is no accrual since last withdraw
        ({ 0: equity, 1: debt } = await msdController.callStatic.calcEquity(
          xUSD.address
        ));
        expect(equity).to.equal(0);
      });
    });
  });
});

describe("iMSD interest model", function () {
  let xUSD, iMUSX, xUSDS, controller, interestRateModel;
  let iToken0;
  let accounts, user1;

  before(async function () {
    ({
      accounts,
      iMUSX,
      iToken0,
      fixedInterestRateModel: interestRateModel,
      controller,
      xUSD,
      xUSDS,
    } = await loadFixture(fixtureDefault));

    user1 = accounts[0];
    let mintAmount = await parseTokenAmount(iToken0, 10000);
    let borrowAmount = await parseTokenAmount(iToken0, 1000);
    // Supply token0 to borrow xUSD
    await iToken0.connect(user1).mint(user1.address, mintAmount);
    await controller.connect(user1).enterMarkets([iToken0.address]);

    await iMUSX.connect(user1).borrow(borrowAmount);
    expect(await xUSD.balanceOf(user1.address)).to.equal(borrowAmount);

    // 0.05 * 10 ** 18 / 2102400
    let borrowRate = BigNumber.from(23782343987);
    await interestRateModel._setBorrowRate(iMUSX.address, borrowRate);
  });

  async function calcTotalBorrows(blockDelta) {
    let oldTotalBorrows = await iMUSX.totalBorrows();
    let simpleInterestFactor = (
      await interestRateModel.borrowRatesPerBlock(iMUSX.address)
    ).mul(blockDelta);
    let interestAccumulated = simpleInterestFactor
      .mul(oldTotalBorrows)
      .div(BASE);

    let newTotalBorrows = oldTotalBorrows.add(interestAccumulated);

    return newTotalBorrows;
  }

  it("Should set borrow rate to 0", async function () {
    let beforeBorrowRate = await interestRateModel.borrowRatesPerBlock(
      iMUSX.address
    );
    expect(beforeBorrowRate).to.be.gt(0);

    // after `_setBorrowRate`. only pass 1 block
    let expectTotalBorrows = await calcTotalBorrows(1);

    await interestRateModel._setBorrowRate(iMUSX.address, 0);
    let afterBorrowRate = await interestRateModel.borrowRatesPerBlock(
      iMUSX.address
    );
    expect(afterBorrowRate).to.equal(0);

    let afterTotalBorrow = await iMUSX.totalBorrows();
    expect(afterTotalBorrow).to.equal(expectTotalBorrows);
  });

  it("Can borrow/repay even though borrow rate is 0", async function () {
    let borrowAmount = await parseTokenAmount(iToken0, 10);
    let repayAmount = await parseTokenAmount(iToken0, 55);
    let beforeTotalBorrows = await iMUSX.totalBorrows();
    // after `_setBorrowRate`. only pass 1 block
    let expectTotalBorrows = await calcTotalBorrows(1);
    let actualTotalBorrows = expectTotalBorrows.add(borrowAmount);

    await expect(() =>
      iMUSX.connect(user1).borrow(borrowAmount)
    ).to.changeTokenBalance(xUSD, user1, borrowAmount);

    let afterTotalBorrow = await iMUSX.totalBorrows();
    expect(afterTotalBorrow).to.equal(actualTotalBorrows);
    expect(beforeTotalBorrows.add(borrowAmount)).to.equal(afterTotalBorrow);

    // after `borrow`. only pass 1 block
    expectTotalBorrows = await calcTotalBorrows(1);
    actualTotalBorrows = expectTotalBorrows.sub(repayAmount);
    beforeTotalBorrows = await iMUSX.totalBorrows();
    await xUSD
      .connect(user1)
      .approve(iMUSX.address, ethers.constants.MaxUint256);
    await expect(() =>
      iMUSX.connect(user1).repayBorrow(repayAmount)
    ).to.changeTokenBalance(xUSD, user1, repayAmount.mul(-1));
    afterTotalBorrow = await iMUSX.totalBorrows();
    expect(afterTotalBorrow).to.equal(actualTotalBorrows);
    expect(beforeTotalBorrows.sub(repayAmount)).to.equal(afterTotalBorrow);
  });

  it("Should set supply rate to 0", async function () {
    await interestRateModel._setSupplyRate(
      iMUSX.address,
      BigNumber.from(28538812785)
    ); // 6%
    let beforeSupplyRate = await interestRateModel.supplyRatesPerBlock(
      iMUSX.address
    );
    expect(beforeSupplyRate).to.be.gt(0);

    await interestRateModel._setSupplyRate(iMUSX.address, 0);
    let afterSupplyRate = await interestRateModel.supplyRatesPerBlock(
      iMUSX.address
    );
    expect(afterSupplyRate).to.equal(0);
  });
});

describe("Test for MSD Controller", function () {
  let xUSD, iMUSX, xUSDS, msdController;
  let iToken0;
  let accounts;

  before(async function () {
    ({
      accounts,
      iMUSX,
      iToken0,
      msdController,
      xUSD,
      xUSDS,
    } = await loadFixture(fixtureDefault));
  });

  describe("Test for mint msdToken", function () {
    it("Should revert when call mint msdToken by a user account", async function () {
      await expect(
        msdController.mintMSD(xUSD.address, accounts[1].address, "100")
      ).to.be.revertedWith("onlyMinter: caller is not the token's minter");
    });
  });

  describe("Test for adding MSD token", function () {
    it("Should not add zero address as a MSD token", async function () {
      // Add xUSD into MSD Controller's token list.
      await expect(
        msdController._addMSD(AddressZero, [iMUSX.address, xUSDS.address])
      ).to.be.revertedWith("MSD token cannot be a zero address");
    });
  });

  describe("Test for adding minter", function () {
    it("Should not add zero address as a minter", async function () {
      // Add xUSD into MSD Controller's token list.
      await expect(
        msdController._addMinters(xUSD.address, [
          iMUSX.address,
          xUSDS.address,
          AddressZero,
        ])
      ).to.be.revertedWith("minter cannot be a zero address");
    });
  });

  describe("Test for removing minter", function () {
    it("Should remove msdToken minter correctly", async function () {
      // Add xUSD into MSD Controller's token list firstly.
      await msdController._addMSD(xUSD.address, [iMUSX.address, xUSDS.address]);
      // Remove a minter of the xUSD.
      await msdController._removeMinter(xUSD.address, xUSDS.address);
    });

    it("Should to remove an unexist minter of msdToken", async function () {
      await msdController._removeMinter(xUSD.address, xUSDS.address);
    });

    it("Should revert when removes minter by a user account", async function () {
      await expect(
        msdController
          .connect(accounts[1])
          ._removeMinter(xUSD.address, iMUSX.address)
      ).to.be.revertedWith("onlyOwner: caller is not the owner");
    });

    it("Should revert when remove minter of a non-msdToken", async function () {
      await expect(
        msdController._removeMinter(iToken0.address, iMUSX.address)
      ).to.be.revertedWith("token is not a valid MSD token");
    });

    it("Should revert when remove minter is zero address.", async function () {
      await expect(
        msdController._removeMinter(xUSD.address, AddressZero)
      ).to.be.revertedWith("_minter cannot be a zero address");
    });
  });

  describe("Test for common checks", function () {
    it("This controller is the msdToken controller", async function () {
      expect(await msdController.isMSDController()).to.equal(true);
    });

    it("Get all msdTokens", async function () {
      let allMSDTokens = await msdController.getAllMSDs();
      expect(allMSDTokens.length).to.equal(2);
    });
  });
});

describe("MSD token permit", async function () {
  const wallet = Wallet.generate();
  const owner = wallet.getAddressString();
  const value = 500;
  const maxDeadline = 999999999999;
  let version = "1";
  let iToken, xUSD, users, user1, user2, user3, spender, name, chainId;

  const buildData = (
    chainId,
    verifyingContract,
    nonce,
    deadline = maxDeadline
  ) => ({
    primaryType: "Permit",
    types: { EIP712Domain, Permit },
    domain: { name, version, chainId, verifyingContract },
    message: { owner, spender, chainId, value, nonce, deadline },
  });

  const init = async () => {
    ({ accounts: users, xUSD: xUSD } = await loadFixture(fixtureDefault));

    [user1, user2, user3] = users;
    spender = user1.address;
    name = await xUSD.name();
    chainId = await getChainId();
  };

  describe("Test all scenarios for permit", function () {
    it("Domain Separator is correct", async function () {
      await init();

      expect(await xUSD.DOMAIN_SEPARATOR()).to.equal(
        await domainSeparator(name, version, chainId, xUSD.address)
      );
    });

    it("Should permit correctly", async function () {
      await init();

      let originalNonce = await xUSD.nonces(owner);

      const data = buildData(
        chainId,
        xUSD.address,
        Number(originalNonce.toString())
      );
      const signature = ethSigUtil.signTypedMessage(wallet.getPrivateKey(), {
        data,
      });
      const { v, r, s } = fromRpcSig(signature);

      await xUSD.permit(owner, spender, value, maxDeadline, v, r, s);
      let currentNonce = await xUSD.nonces(owner);

      expect(currentNonce.sub(originalNonce)).to.equal(1);
      expect(await xUSD.allowance(owner, spender)).to.equal(value);
    });

    it("Should revert due to expired!", async function () {
      let currentNonce = await xUSD.nonces(owner);
      const expiredTime = 1;
      const data = buildData(
        chainId,
        xUSD.address,
        Number(currentNonce.toString()),
        expiredTime
      );
      const signature = ethSigUtil.signTypedMessage(wallet.getPrivateKey(), {
        data,
      });
      const { v, r, s } = fromRpcSig(signature);

      await expect(
        xUSD.permit(owner, spender, value, expiredTime, v, r, s)
      ).to.be.revertedWith("permit: EXPIRED!");
    });

    it("Should revert due to invalid signature", async function () {
      let currentNonce = await xUSD.nonces(owner);
      const data = buildData(
        chainId,
        xUSD.address,
        Number(currentNonce.toString())
      );
      const signature = ethSigUtil.signTypedMessage(wallet.getPrivateKey(), {
        data,
      });
      const { v, r, s } = fromRpcSig(signature);

      await expect(
        xUSD.permit(owner, xUSD.address, value, maxDeadline, v, r, s)
      ).to.be.revertedWith("permit: INVALID_SIGNATURE!");
    });
  });
});

describe("MSDS token permit", async function () {
  const wallet = Wallet.generate();
  const owner = wallet.getAddressString();
  const value = 500;
  const maxDeadline = 999999999999;
  let version = "1";
  let xUSDS, users, user1, user2, user3, spender, name, chainId;

  const buildData = (
    chainId,
    verifyingContract,
    nonce,
    deadline = maxDeadline
  ) => ({
    primaryType: "Permit",
    types: { EIP712Domain, Permit },
    domain: { name, version, chainId, verifyingContract },
    message: { owner, spender, chainId, value, nonce, deadline },
  });

  const init = async () => {
    ({ accounts: users, xUSDS: xUSDS } = await loadFixture(fixtureDefault));

    [user1, user2, user3] = users;
    spender = user1.address;
    name = await xUSDS.name();
    chainId = await getChainId();
  };

  describe("Test all scenarios for permit", function () {
    it("Domain Separator is correct", async function () {
      await init();

      expect(await xUSDS.DOMAIN_SEPARATOR()).to.equal(
        await domainSeparator(name, version, chainId, xUSDS.address)
      );
    });

    it("Should permit correctly", async function () {
      await init();

      let originalNonce = await xUSDS.nonces(owner);

      const data = buildData(
        chainId,
        xUSDS.address,
        Number(originalNonce.toString())
      );
      const signature = ethSigUtil.signTypedMessage(wallet.getPrivateKey(), {
        data,
      });
      const { v, r, s } = fromRpcSig(signature);

      await xUSDS.permit(owner, spender, value, maxDeadline, v, r, s);
      let currentNonce = await xUSDS.nonces(owner);

      expect(currentNonce.sub(originalNonce)).to.equal(1);
      expect(await xUSDS.allowance(owner, spender)).to.equal(value);
    });

    it("Should revert due to expired!", async function () {
      let currentNonce = await xUSDS.nonces(owner);
      const expiredTime = 1;
      const data = buildData(
        chainId,
        xUSDS.address,
        Number(currentNonce.toString()),
        expiredTime
      );
      const signature = ethSigUtil.signTypedMessage(wallet.getPrivateKey(), {
        data,
      });
      const { v, r, s } = fromRpcSig(signature);

      await expect(
        xUSDS.permit(owner, spender, value, expiredTime, v, r, s)
      ).to.be.revertedWith("permit: EXPIRED!");
    });

    it("Should revert due to invalid signature", async function () {
      let currentNonce = await xUSDS.nonces(owner);
      const data = buildData(
        chainId,
        xUSDS.address,
        Number(currentNonce.toString())
      );
      const signature = ethSigUtil.signTypedMessage(wallet.getPrivateKey(), {
        data,
      });
      const { v, r, s } = fromRpcSig(signature);

      await expect(
        xUSDS.permit(owner, xUSDS.address, value, maxDeadline, v, r, s)
      ).to.be.revertedWith("permit: INVALID_SIGNATURE!");
    });
  });
});
