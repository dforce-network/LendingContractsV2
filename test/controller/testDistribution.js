const { expect } = require("chai");
const { utils, BigNumber } = require("ethers");

const {
  verifyOnlyOwner,
  parseTokenAmount,
  setOraclePrices,
  verifyAllowError,
  rdiv,
  rmul,
  divup,
} = require("../helpers/utils.js");

const {
  loadFixture,
  fixtureDefault,
  increaseBlock,
  getBlock,
  getiTokenCurrentData,
} = require("../helpers/fixtures.js");

const { formatEther } = require("ethers/lib/utils");

async function getBlockBN() {
  return BigNumber.from(await getBlock());
}

const BASE = utils.parseEther("1");

describe("Controller: Reward Distribution", function () {
  let controller,
    iToken0,
    iToken1,
    iMUSX,
    priceOracle,
    owner,
    accounts,
    rewardDistributor;
  let globalBorrowSpeed = utils.parseEther("10000");
  let globalSupplySpeed = utils.parseEther("20000");
  let borrowSpeed0 = utils.parseEther("5000");
  let borrowSpeed1 = utils.parseEther("5000");
  let supplySpeed0 = utils.parseEther("10000");
  let supplySpeed1 = utils.parseEther("10000");
  let user1, user2;
  let account1, account2;
  let amount0, amount1, amount2;

  beforeEach(async function () {
    ({
      controller,
      iToken0,
      iToken1,
      iMUSX,
      owner,
      accounts,
      priceOracle,
      rewardDistributor,
    } = await loadFixture(fixtureDefault));

    [user1, user2] = accounts;
    account1 = await user1.getAddress();
    account2 = await user2.getAddress();

    amount0 = await parseTokenAmount(iToken0, 1000);
    amount1 = await parseTokenAmount(iToken1, 1000);
    amount2 = await parseTokenAmount(iMUSX, 1000);

    await controller
      .connect(user1)
      .enterMarkets([iToken0.address, iToken1.address]);
    await controller
      .connect(user2)
      .enterMarkets([iToken0.address, iToken1.address]);

    await iToken0.connect(user1).mint(account1, amount0);
    await iToken1.connect(user1).mint(account1, amount1);

    // Now by default it is paused
    await rewardDistributor._unpause(
      [iToken0.address, iToken1.address],
      [0, 0],
      [iToken0.address, iToken1.address],
      [0, 0]
    );
  });

  async function calcSupplyValue(iToken) {
    return (await iToken.totalSupply())
      .mul(await iToken.exchangeRateStored())
      .div(BASE)
      .mul(await priceOracle.getUnderlyingPrice(iToken.address))
      .mul(await rewardDistributor.distributionFactorMantissa(iToken.address))
      .div(BASE);
  }

  async function calcBorrowValue(iToken) {
    return (await iToken.totalBorrows())
      .mul(await priceOracle.getUnderlyingPrice(iToken.address))
      .mul(await rewardDistributor.distributionFactorMantissa(iToken.address))
      .div(BASE);
  }

  async function verifyTokensDistributionSpeed(
    iTokens,
    borrowSpeeds,
    supplySpeeds
  ) {
    for (let i = 0; i < iTokens.length; i++) {
      const iToken = iTokens[i];
      const expectedSupplySpeed = supplySpeeds[i];
      const expectedBorrowSpeed = borrowSpeeds[i];

      expect(expectedBorrowSpeed).to.equal(
        await rewardDistributor.distributionSpeed(iToken.address)
      );
      expect(expectedSupplySpeed).to.equal(
        await rewardDistributor.distributionSupplySpeed(iToken.address)
      );

      // console.log(
      //   await iToken.symbol(),
      //   ":\tBorrowSpeed:\t",
      //   expectedBorrowSpeed.toString(),
      //   "\tSupplySpeed:\t",
      //   expectedSupplySpeed.toString()
      // );
    }
  }

  describe("Add Recipient", function () {
    it("Should allow controller to add recipient", async function () {
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [controller.address],
      });
      const signer = await ethers.provider.getSigner(controller.address);

      await rewardDistributor
        .connect(signer)
        .callStatic._addRecipient(iToken1.address, utils.parseEther("1"));

      await hre.network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [controller.address],
      });
    });

    it("Should not allow non-controller to add recipient", async function () {
      await expect(
        rewardDistributor._addRecipient(iToken1.address, utils.parseEther("1"))
      ).to.revertedWith("onlyController: caller is not the controller");
    });
  });

  describe("set distribution speeds", function () {
    it("Should only allow owner to set distribution speeds", async function () {
      await verifyOnlyOwner(
        rewardDistributor, //contract
        "_setDistributionSpeeds", // method
        [
          [iToken0.address, iToken1.address],
          [borrowSpeed0, borrowSpeed1],
          [iToken0.address, iToken1.address],
          [supplySpeed0, supplySpeed1],
        ], //args
        owner, // owner
        accounts[0], // non-owner
        "GlobalDistributionSpeedsUpdated", // ownerEvent
        [globalBorrowSpeed, globalSupplySpeed], // ownerEventArgs
        // ownerChecks
        async () => {
          expect(await rewardDistributor.globalDistributionSpeed()).to.equal(
            globalBorrowSpeed
          );
          expect(
            await rewardDistributor.globalDistributionSupplySpeed()
          ).to.equal(globalSupplySpeed);

          await verifyTokensDistributionSpeed(
            [iToken0, iToken1, iMUSX],
            [borrowSpeed0, borrowSpeed1, 0],
            [supplySpeed0, supplySpeed1, 0]
          );
        },
        // nonownerChecks
        async () => {
          expect(await rewardDistributor.globalDistributionSpeed()).to.equal(0);
          expect(
            await rewardDistributor.globalDistributionSupplySpeed()
          ).to.equal(0);
        }
      );
    });
  });

  // Distribution factor is not used any more
  describe.skip("Distribution Factor", function () {
    let distributionFactor0 = utils.parseEther("1");
    let distributionFactor1 = utils.parseEther("1.5");

    it("Should only allow owner to set distribution factor", async function () {
      let oldDistributionFactor = await rewardDistributor.distributionFactorMantissa(
        iToken0.address
      );
      let newDistributionFactor = utils.parseEther("2");

      await verifyOnlyOwner(
        rewardDistributor, //contract
        "_setDistributionFactors", // method
        [[iToken0.address], [newDistributionFactor]], //args
        owner, // owner
        accounts[0], // non-owner
        "NewDistributionFactor", // ownerEvent
        [iToken0.address, oldDistributionFactor, newDistributionFactor], // ownerEventArgs
        // ownerChecks
        async () => {
          expect(
            await rewardDistributor.distributionFactorMantissa(iToken0.address)
          ).to.equal(utils.parseEther("2"));
        },
        // nonownerChecks
        async () => {
          expect(
            await rewardDistributor.distributionFactorMantissa(iToken0.address)
          ).to.equal(utils.parseEther("1"));
        }
      );
    });

    it("Should update distribution speed after update distribution factor ", async function () {
      await iToken0.connect(user1).mint(account1, amount0);
      await iToken1.connect(user1).mint(account1, amount1);

      await iToken0.connect(user1).borrow(amount0.div(3));
      await iToken1.connect(user1).borrow(amount1.div(3));
      await iMUSX.connect(user1).borrow(amount2.div(3));

      await rewardDistributor._setGlobalDistributionSpeeds(
        globalBorrowSpeed,
        globalSupplySpeed
      );

      // Now iToken0 has 200% weight, iToken1 only has 100%
      let distributionFactor0 = utils.parseEther("2");
      let distributionFactor1 = utils.parseEther("1");
      await rewardDistributor._setDistributionFactors(
        [iToken0.address, iToken1.address],
        [distributionFactor0, distributionFactor1]
      );

      await verifyTokensDistributionSpeed([iToken0, iToken1, iMUSX]);
    });

    it("Should fail if the iToken has not been listed", async function () {
      await expect(
        rewardDistributor._setDistributionFactors(
          [controller.address, iToken1.address],
          [distributionFactor0, distributionFactor1]
        )
      ).to.be.revertedWith("Token has not been listed");
    });

    it("Should fail if the iTokens and distribution factors has different length", async function () {
      await expect(
        rewardDistributor._setDistributionFactors(
          [iToken0.address, iToken1.address],
          [distributionFactor0, distributionFactor1, distributionFactor1]
        )
      ).to.be.revertedWith(
        "Length of _iTokens and _distributionFactors mismatch"
      );
    });

    it("Should fail if reward distribution is paused", async function () {
      await rewardDistributor._pause();

      await expect(
        rewardDistributor._setDistributionFactors(
          [iToken0.address, iToken1.address],
          [distributionFactor0, distributionFactor1]
        )
      ).to.be.revertedWith("Can not update distribution factors when paused");
    });
  });

  describe("Reward Token", function () {
    it("Should only allow owner to set reward token", async function () {
      const Token = await ethers.getContractFactory("Token");
      const DF = await Token.deploy("DF", "DF", 18);
      await DF.deployed();

      let oldRewardToken = await rewardDistributor.rewardToken();
      let newRewardToken = DF.address;

      await verifyOnlyOwner(
        rewardDistributor, //contract
        "_setRewardToken", // method
        [newRewardToken], //args
        owner, // owner
        accounts[0], // non-owner
        "NewRewardToken", // ownerEvent
        [oldRewardToken, newRewardToken], // ownerEventArgs
        // ownerChecks
        async () => {
          expect(await rewardDistributor.rewardToken()).to.equal(DF.address);
        },
        // nonownerChecks
        async () => {
          expect(await rewardDistributor.rewardToken()).to.equal(
            ethers.constants.AddressZero
          );
        }
      );
    });

    it("Should not update reward token with invalid address", async function () {
      let oldRewardToken = await rewardDistributor.rewardToken();

      await expect(
        rewardDistributor._setRewardToken(oldRewardToken)
      ).to.be.revertedWith("Reward token address invalid");

      await expect(
        rewardDistributor._setRewardToken(ethers.constants.AddressZero)
      ).to.be.revertedWith("Reward token address invalid");
    });
  });

  // Distribution speed is directly set by owner
  describe.skip("Update Distribution Speed", function () {
    it("Should fail if called by a contract", async function () {
      const Caller = await ethers.getContractFactory(
        "UpdateDistributionSpeedCaller"
      );
      const caller = await Caller.deploy();
      await caller.deployed();

      await expect(caller.call(rewardDistributor.address)).to.revertedWith(
        "only EOA can update speeds"
      );
    });

    let borrowAmounts = [
      [0, 100, 30],
      [20, 20, 20],
      [20, 0, 0],
      [20, 0, 20],
      [0, 0, 20],
    ];

    let underlyingPrices = [
      [1.0, 1.0, 1.0],
      [1.0, 2.0, 3.0],
      [0.0, 0.0, 0.0],
    ];

    borrowAmounts.forEach(async function (borrowAmount) {
      underlyingPrices.forEach(async function (underlyingPrice) {
        it(`With borrowAmounts: ${borrowAmount}, underlyingPrice: ${underlyingPrice}`, async function () {
          await rewardDistributor._setGlobalDistributionSpeeds(
            globalBorrowSpeed,
            globalSupplySpeed
          );

          if (borrowAmount[0] > 0)
            await iToken0
              .connect(user1)
              .borrow(await parseTokenAmount(iToken0, borrowAmount[0]));
          if (borrowAmount[1] > 0)
            await iToken1
              .connect(user1)
              .borrow(await parseTokenAmount(iToken1, borrowAmount[1]));
          if (borrowAmount[2] > 0)
            await iMUSX
              .connect(user1)
              .borrow(await parseTokenAmount(iMUSX, borrowAmount[2]));

          // Pause will return all 0
          if (underlyingPrice[0] > 0) {
            await setOraclePrices(
              priceOracle,
              [iToken0, iToken1, iMUSX],
              underlyingPrice
            );
          } else {
            await priceOracle._setPaused(true);
          }

          await rewardDistributor.updateDistributionSpeed();

          await verifyTokensDistributionSpeed([iToken0, iToken1, iMUSX]);
        });
      });
    });
  });
});

describe("Update Distribution State", function () {
  let controller,
    iToken0,
    iToken1,
    priceOracle,
    owner,
    accounts,
    rewardDistributor;
  let borrowSpeed0 = utils.parseEther("5000");
  let borrowSpeed1 = utils.parseEther("5000");
  let supplySpeed0 = utils.parseEther("10000");
  let supplySpeed1 = utils.parseEther("10000");
  let user1, user2;
  let account1, account2;
  let amount0, amount1;

  before(async function () {
    ({
      controller,
      iToken0,
      iToken1,
      owner,
      accounts,
      priceOracle,
      rewardDistributor,
    } = await loadFixture(fixtureDefault));

    [user1, user2] = accounts;
    account1 = await user1.getAddress();
    account2 = await user2.getAddress();

    amount0 = await parseTokenAmount(iToken0, 1000);
    amount1 = await parseTokenAmount(iToken1, 1000);

    await controller
      .connect(user1)
      .enterMarkets([iToken0.address, iToken1.address]);
    await controller
      .connect(user2)
      .enterMarkets([iToken0.address, iToken1.address]);

    await iToken0.connect(user1).mint(account1, amount0);
    await iToken0.connect(user2).mint(account2, amount0);

    await iToken1.connect(user1).mint(account1, amount1);
    await iToken1.connect(user2).mint(account2, amount1);

    await iToken0.connect(user1).borrow(amount0.div(2));
    await iToken0.connect(user2).borrow(amount0.div(2));

    await iToken1.connect(user1).borrow(amount1.div(2));
    await iToken1.connect(user2).borrow(amount1.div(2));

    await rewardDistributor._unpause(
      [iToken0.address, iToken1.address],
      [borrowSpeed0, borrowSpeed1],
      [iToken0.address, iToken1.address],
      [supplySpeed0, supplySpeed1]
    );
  });

  let actions = [
    {
      description: "No action at all, only forward blocks",
      setup: async function () {
        this.func = "";
        this.sender = user1;
        this.iToken = iToken0;
        this.users = [user1, user2];
        this.iTokens = [iToken0, iToken1];
        this.args = [
          await user1.getAddress(),
          await parseTokenAmount(iToken0, 100),
        ];
      },
    },
    {
      description: "Mint 100 iToken0",
      setup: async function () {
        this.func = "mint";
        this.sender = user1;
        this.iToken = iToken0;
        this.users = [user1, user2];
        this.iTokens = [iToken0, iToken1];
        this.args = [
          await user1.getAddress(),
          await parseTokenAmount(iToken0, 100),
        ];
      },
    },
    {
      description: "Redeem 50 iToken0",
      setup: async function () {
        this.func = "redeem";
        this.sender = user1;
        this.iToken = iToken0;
        this.users = [user1, user2];
        this.iTokens = [iToken0, iToken1];
        this.args = [
          await user1.getAddress(),
          await parseTokenAmount(iToken0, 50),
        ];
      },
    },
    {
      description: "RedeemUnderlying 50 iToken0",
      setup: async function () {
        this.func = "redeemUnderlying";
        this.sender = user1;
        this.iToken = iToken0;
        this.users = [user1, user2];
        this.iTokens = [iToken0, iToken1];
        this.args = [
          await user1.getAddress(),
          await parseTokenAmount(iToken0, 50),
        ];
      },
    },
    {
      description: "Borrow 20 iToken0",
      setup: async function () {
        this.func = "borrow";
        this.sender = user1;
        this.iToken = iToken0;
        this.users = [user1, user2];
        this.iTokens = [iToken0, iToken1];
        this.args = [await parseTokenAmount(iToken0, 20)];
      },
    },
    {
      description: "RepayBorrow 100 iToken0",
      setup: async function () {
        this.func = "repayBorrow";
        this.sender = user1;
        this.iToken = iToken0;
        this.users = [user1, user2];
        this.iTokens = [iToken0, iToken1];
        this.args = [await parseTokenAmount(iToken0, 100)];
      },
    },
    {
      description: "Transfer 100 iToken0",
      setup: async function () {
        this.func = "transfer";
        this.sender = user1;
        this.iToken = iToken0;
        this.users = [user1, user2];
        this.iTokens = [iToken0, iToken1];
        this.args = [
          await user2.getAddress(),
          await parseTokenAmount(iToken0, 100),
        ];
      },
    },
    {
      description: "liquidateBorrow 10 iToken0, and seize iToken1",
      setup: async function () {
        this.func = "liquidateBorrow";
        this.sender = user1;
        this.iToken = iToken0;
        this.users = [user1, user2];
        this.iTokens = [iToken0, iToken1];
        this.args = [
          await user2.getAddress(),
          await parseTokenAmount(iToken0, 10),
          iToken1.address,
        ];

        // Set collateral factor to 0, so it can be liquidated
        await controller._setCollateralFactor(iToken0.address, 0);
      },
    },
  ];

  async function executeAction(action) {
    const { func, sender, iToken, args } = action;

    if (func === "") {
      // Update interest to update the state
      await iToken.connect(sender).updateInterest();
    } else {
      await iToken.connect(sender)[func](...args);
    }
  }

  async function getDistributionState(iToken, is_borrow) {
    let state = {};
    if (is_borrow) {
      ({
        index: state.index,
        block: state.block,
      } = await rewardDistributor.distributionBorrowState(iToken.address));

      state.speed = await rewardDistributor.distributionSpeed(iToken.address);
    } else {
      ({
        index: state.index,
        block: state.block,
      } = await rewardDistributor.distributionSupplyState(iToken.address));

      state.speed = await rewardDistributor.distributionSupplySpeed(
        iToken.address
      );
    }

    return state;
  }

  async function getSupplyState(iToken) {
    let state = await getDistributionState(iToken, false);
    state.totalSupply = await iToken.totalSupply();

    return state;
  }

  async function getBorrowState(iToken, blockDelta) {
    let state = await getDistributionState(iToken, true);

    const data = await getiTokenCurrentData(iToken, blockDelta);

    state.totalBorrows = data.totalBorrows;
    state.borrowIndex = data.borrowIndex;

    return state;
  }

  async function getAccountTokenState(account, iToken, blockDelta) {
    let state = {};

    state.balance = await iToken.balanceOf(account);

    let { 0: principal, 1: interestIndex } = await iToken.borrowSnapshot(
      account
    );

    // Calculate the borrow balance in advance
    state.borrowBalance = divup(
      principal.mul(
        (await getiTokenCurrentData(iToken, blockDelta)).borrowIndex
      ),
      interestIndex
    );

    state.supplierIndex = await rewardDistributor.distributionSupplierIndex(
      iToken.address,
      account
    );
    state.borrowerIndex = await rewardDistributor.distributionBorrowerIndex(
      iToken.address,
      account
    );

    return state;
  }

  async function getAccountState(account, iTokens, blockDelta) {
    let state = {};

    state.iTokens = {};
    for (iToken of iTokens) {
      state.iTokens[iToken.address] = await getAccountTokenState(
        account,
        iToken,
        blockDelta
      );
    }

    state.reward = await rewardDistributor.reward(account);

    return state;
  }

  async function getState(iTokens, accounts, blockDelta) {
    let state = {};

    state.iTokens = {};
    state.accounts = {};
    for (iToken of iTokens) {
      let address = iToken.address;
      let supply = await getSupplyState(iToken);
      let borrow = await getBorrowState(iToken, blockDelta);

      state.iTokens[address] = { supply: supply, borrow: borrow };
    }

    for (account of accounts) {
      state.accounts[account] = await getAccountState(
        account,
        iTokens,
        blockDelta
      );
    }

    // console.log(JSON.stringify(state, null, 2));
    return state;
  }

  async function calcExpectedMintAndRedeem(preState, action) {
    let expected = preState;
    let currentBlock = BigNumber.from(await getBlock());

    // Mint/Redeem only change the state of current targeting iToken
    const address = action.iToken.address;

    let supply = expected.iTokens[address].supply;
    let blockDelta = currentBlock.sub(supply.block);

    supply.block = currentBlock;
    supply.index = supply.index.add(
      rdiv(supply.speed.mul(blockDelta), supply.totalSupply)
    );

    // Mint/Redeem only change the state of recipient which is args[0]
    const account = action.args[0];

    const indexDelta = expected.iTokens[address].supply.index.sub(
      expected.accounts[account].iTokens[address].supplierIndex
    );

    expected.accounts[account].iTokens[address].supplierIndex =
      expected.iTokens[address].supply.index;

    expected.accounts[account].reward = expected.accounts[account].reward.add(
      rmul(indexDelta, expected.accounts[account].iTokens[address].balance)
    );

    // console.log(JSON.stringify(expected, null, 2));
    return expected;
  }

  async function calcExpectedBorrowAndRepay(preState, action) {
    let expected = preState;
    let currentBlock = BigNumber.from(await getBlock());

    // Borrow/Repay only change the state of current targeting iToken
    const address = action.iToken.address;

    let borrow = expected.iTokens[address].borrow;
    let blockDelta = currentBlock.sub(borrow.block);

    borrow.block = currentBlock;
    borrow.index = borrow.index.add(
      rdiv(
        borrow.speed.mul(blockDelta),
        rdiv(borrow.totalBorrows, borrow.borrowIndex)
      )
    );

    // Borrow/Repay only change the state of msg.sender
    const account = await action.sender.getAddress();

    const indexDelta = expected.iTokens[address].borrow.index.sub(
      expected.accounts[account].iTokens[address].borrowerIndex
    );

    expected.accounts[account].iTokens[address].borrowerIndex =
      expected.iTokens[address].borrow.index;

    expected.accounts[account].reward = expected.accounts[account].reward.add(
      rmul(
        indexDelta,
        rdiv(
          expected.accounts[account].iTokens[address].borrowBalance,
          borrow.borrowIndex
        )
      )
    );

    // console.log(JSON.stringify(expected, null, 2));
    return expected;
  }

  async function calcExpectedTransfer(preState, action) {
    let expected = preState;
    let currentBlock = BigNumber.from(await getBlock());

    // Transfer only change the state of current targeting iToken
    const address = action.iToken.address;

    let supply = expected.iTokens[address].supply;
    let blockDelta = currentBlock.sub(supply.block);

    supply.block = currentBlock;
    supply.index = supply.index.add(
      rdiv(supply.speed.mul(blockDelta), supply.totalSupply)
    );

    // Transfer will change the state of msg.sender and recipient args[0]
    const accounts = [await action.sender.getAddress(), action.args[0]];

    for (account of accounts) {
      const indexDelta = expected.iTokens[address].supply.index.sub(
        expected.accounts[account].iTokens[address].supplierIndex
      );

      expected.accounts[account].iTokens[address].supplierIndex =
        expected.iTokens[address].supply.index;

      expected.accounts[account].reward = expected.accounts[account].reward.add(
        rmul(indexDelta, expected.accounts[account].iTokens[address].balance)
      );
    }

    // console.log(JSON.stringify(expected, null, 2));
    return expected;
  }

  async function calcExpectedLiquidateBorrow(preState, action) {
    let expected = preState;
    let currentBlock = BigNumber.from(await getBlock());

    // liquidate borrow will change the borrow state of current targeting iToken
    const address = action.iToken.address;

    let borrow = expected.iTokens[address].borrow;
    let blockDelta = currentBlock.sub(borrow.block);

    borrow.block = currentBlock;
    borrow.index = borrow.index.add(
      rdiv(
        borrow.speed.mul(blockDelta),
        rdiv(borrow.totalBorrows, borrow.borrowIndex)
      )
    );

    // liquidate borrow will change the supply state of seized iToken
    const sAddress = action.args[2];

    let supply = expected.iTokens[sAddress].supply;
    blockDelta = currentBlock.sub(supply.block);

    supply.block = currentBlock;
    supply.index = supply.index.add(
      rdiv(supply.speed.mul(blockDelta), supply.totalSupply)
    );

    const liquidator = await action.sender.getAddress();
    const borrower = action.args[0];

    // liquidate borrow will change supply the state of msg.sender
    let indexDelta = expected.iTokens[sAddress].supply.index.sub(
      expected.accounts[liquidator].iTokens[sAddress].supplierIndex
    );

    expected.accounts[liquidator].iTokens[sAddress].supplierIndex =
      expected.iTokens[sAddress].supply.index;

    expected.accounts[liquidator].reward = expected.accounts[
      liquidator
    ].reward.add(
      rmul(indexDelta, expected.accounts[liquidator].iTokens[sAddress].balance)
    );

    // liquidate borrow will change supply the state of Borrower
    indexDelta = expected.iTokens[sAddress].supply.index.sub(
      expected.accounts[borrower].iTokens[sAddress].supplierIndex
    );

    expected.accounts[borrower].iTokens[sAddress].supplierIndex =
      expected.iTokens[sAddress].supply.index;

    expected.accounts[borrower].reward = expected.accounts[borrower].reward.add(
      rmul(indexDelta, expected.accounts[borrower].iTokens[sAddress].balance)
    );

    // liquidate borrow will change borrower's args[0] borrow state of current iToken
    indexDelta = expected.iTokens[address].borrow.index.sub(
      expected.accounts[borrower].iTokens[address].borrowerIndex
    );

    expected.accounts[borrower].iTokens[address].borrowerIndex =
      expected.iTokens[address].borrow.index;

    expected.accounts[borrower].reward = expected.accounts[borrower].reward.add(
      rmul(
        indexDelta,
        rdiv(
          expected.accounts[borrower].iTokens[address].borrowBalance,
          borrow.borrowIndex
        )
      )
    );

    // console.log(indexDelta);

    // console.log(JSON.stringify(expected, null, 2));
    return expected;
  }

  async function calcExpected(preState, action) {
    let expected;

    switch (action.func) {
      case "mint":
      case "redeem":
      case "redeemUnderlying":
        expected = await calcExpectedMintAndRedeem(preState, action);
        break;

      case "borrow":
      case "repayBorrow":
        expected = await calcExpectedBorrowAndRepay(preState, action);
        break;

      case "transfer":
        expected = await calcExpectedTransfer(preState, action);
        break;

      case "liquidateBorrow":
        expected = await calcExpectedLiquidateBorrow(preState, action);
        break;

      default:
        expected = preState;
        break;
    }

    return expected;
  }

  function verify(expected, postState) {
    // Skip the check of the total supply/borrow here
    for (address in expected.iTokens) {
      delete expected.iTokens[address].supply.totalSupply;
      delete expected.iTokens[address].borrow.totalBorrows;
      delete postState.iTokens[address].supply.totalSupply;
      delete postState.iTokens[address].borrow.totalBorrows;
    }

    // Skip the check of the balance/borrowBalance here
    for (account in expected.accounts) {
      for (address in expected.accounts[account].iTokens) {
        delete expected.accounts[account].iTokens[address].balance;
        delete expected.accounts[account].iTokens[address].borrowBalance;
        delete postState.accounts[account].iTokens[address].balance;
        delete postState.accounts[account].iTokens[address].borrowBalance;
      }
    }

    // Final deep check here
    expect(expected).to.deep.equal(postState);
  }

  actions.forEach(function (action) {
    it(`Checking state after ${action.description}`, async function () {
      await action.setup();

      const { iTokens, users } = action;

      const accounts = await Promise.all(
        users.map(async (a) => await a.getAddress())
      );

      let blockDelta = 100;

      const preState = await getState(iTokens, accounts, blockDelta);

      // The action itself will forward 1 block
      await increaseBlock(blockDelta - 1);
      await executeAction(action);

      const postState = await getState(iTokens, accounts, 0);

      let expected = await calcExpected(preState, action);
      verify(expected, postState);
    });
  });

  it("Should fail when try to update distribution state of non-listed token", async function () {
    await expect(
      rewardDistributor.updateDistributionState(controller.address, false)
    ).to.be.revertedWith("Token has not been listed");

    await expect(
      rewardDistributor.updateDistributionState(controller.address, true)
    ).to.be.revertedWith("Token has not been listed");
  });
});

describe("Claiming reward", async function () {
  let controller,
    iToken0,
    iToken1,
    priceOracle,
    owner,
    accounts,
    rewardDistributor;
  let globalBorrowSpeed = utils.parseEther("10000");
  let globalSupplySpeed = utils.parseEther("20000");
  let borrowSpeed0 = utils.parseEther("5000");
  let borrowSpeed1 = utils.parseEther("5000");
  let supplySpeed0 = utils.parseEther("10000");
  let supplySpeed1 = utils.parseEther("10000");
  let user1, user2, user3;
  let account1, account2, account3;
  let amount0, amount1;
  let DF;
  let startBlock;

  beforeEach(async function () {
    ({
      controller,
      iToken0,
      iToken1,
      owner,
      accounts,
      priceOracle,
      rewardDistributor,
    } = await loadFixture(fixtureDefault));

    [user1, user2, user3] = accounts;
    account1 = await user1.getAddress();
    account2 = await user2.getAddress();
    account3 = await user3.getAddress();

    amount0 = await parseTokenAmount(iToken0, 1000);
    amount1 = await parseTokenAmount(iToken1, 1000);

    await controller
      .connect(user1)
      .enterMarkets([iToken0.address, iToken1.address]);
    await controller
      .connect(user2)
      .enterMarkets([iToken0.address, iToken1.address]);

    const Token = await ethers.getContractFactory("Token");
    DF = await Token.deploy("DF", "DF", 18);
    await DF.deployed();

    // Prepare reward
    await DF.mint(
      rewardDistributor.address,
      parseTokenAmount(DF, "10000000000")
    );
    await rewardDistributor._setRewardToken(DF.address);

    // await rewardDistributor._unpause(
    //   [iToken0.address, iToken1.address],
    //   [0, borrowSpeed1],
    //   [iToken0.address, iToken1.address],
    //   [supplySpeed0, supplySpeed1]
    // );
  });

  it("Should be able to claim reward", async function () {
    // Only 1 user mint/borrow
    await iToken0.connect(user1).mint(account1, amount0);
    await iToken0.connect(user1).borrow(amount0.div(2));

    // _unpause at the last step for easy calculation
    await rewardDistributor._unpause(
      [iToken0.address, iToken1.address],
      [0, borrowSpeed1],
      [iToken0.address, iToken1.address],
      [supplySpeed0, supplySpeed1]
    );

    await increaseBlock(99);

    // _unpause should update both supply and borrow state
    startBlock = (
      await rewardDistributor.distributionSupplyState(iToken0.address)
    ).block;

    let currentBlock = (await getBlockBN()).add(1);
    let blockDelta = currentBlock.sub(startBlock);

    // user1 should be able to claim all on both supply and borrow
    let reward = (await rewardDistributor.distributionSpeed(iToken0.address))
      .mul(blockDelta)
      .add(
        (await rewardDistributor.distributionSupplySpeed(iToken0.address)).mul(
          blockDelta
        )
      );

    await expect(() =>
      rewardDistributor.claimReward([account1], [iToken0.address])
    ).to.changeTokenBalance(DF, user1, reward);

    // Should claim all reward
    expect(await rewardDistributor.reward(account1)).to.equal(0);
  });

  it("Should not be able to claim reward with non-listed token", async function () {
    await expect(
      rewardDistributor.claimReward([account1], [DF.address])
    ).to.revertedWith("Token has not been listed");
  });

  it("Should be able to claim all reward", async function () {
    await iToken0.connect(user1).mint(account1, amount0);
    await iToken0.connect(user2).mint(account2, amount0);

    await iToken1.connect(user1).mint(account1, amount1);
    await iToken1.connect(user2).mint(account2, amount1);

    await iToken0.connect(user1).borrow(amount0.div(2));
    await iToken0.connect(user2).borrow(amount0.div(2));

    await iToken1.connect(user1).borrow(amount1.div(2));
    await iToken1.connect(user2).borrow(amount1.div(2));

    // Refresh the speed and token State at the last step for easy calculation
    await rewardDistributor._unpause(
      [iToken0.address, iToken1.address],
      [0, borrowSpeed1],
      [iToken0.address, iToken1.address],
      [supplySpeed0, supplySpeed1]
    );

    // _unpause should update both supply and borrow state to the same block
    startBlock = (
      await rewardDistributor.distributionSupplyState(iToken1.address)
    ).block;

    await increaseBlock(99);

    let balanceBefore = (await DF.balanceOf(account1)).add(
      await DF.balanceOf(account2)
    );
    await rewardDistributor.claimAllReward([account1, account2, account3]);
    let balanceAfter = (await DF.balanceOf(account1)).add(
      await DF.balanceOf(account2)
    );

    let currentBlock = await getBlockBN();
    let blockDelta = currentBlock.sub(startBlock);

    // 2 users should be able to claim all on both supply and borrow
    let reward = (await rewardDistributor.globalDistributionSpeed())
      .mul(blockDelta)
      .add(
        (await rewardDistributor.globalDistributionSupplySpeed()).mul(
          blockDelta
        )
      );

    // console.log(
    //   (await rewardDistributor.distributionBorrowState(iToken0.address)).map((i) =>
    //     i.toString()
    //   )
    // );

    // Borrow will accured interest, the 2nd borrow will not match the 1st one
    // with the same amount, therefore there could be some rounding errors
    verifyAllowError(balanceAfter.sub(balanceBefore), reward, 0.000001);
    // expect(balanceAfter.sub(balanceBefore)).to.equal(reward);

    // Should claim all reward
    expect(await rewardDistributor.reward(account1)).to.equal(0);
    expect(await rewardDistributor.reward(account2)).to.equal(0);
  });

  it("Should fail when try to update claim non-listed token", async function () {
    await expect(
      rewardDistributor.claimReward([account1], [controller.address])
    ).to.be.revertedWith("Token has not been listed");

    await expect(
      rewardDistributor.updateReward(controller.address, account1, true)
    ).to.be.revertedWith("Token has not been listed");
  });

  it("Should fail when try to update reward distribution state for the zero account", async function () {
    await expect(
      rewardDistributor.updateReward(
        iToken1.address,
        ethers.constants.AddressZero,
        true
      )
    ).to.be.revertedWith("Invalid account address!");
  });
});

describe("Pause/Unpause", async function () {
  let controller,
    iToken0,
    iToken1,
    priceOracle,
    owner,
    accounts,
    rewardDistributor;
  let globalBorrowSpeed = utils.parseEther("10000");
  let globalSupplySpeed = utils.parseEther("20000");
  let borrowSpeed0 = utils.parseEther("5000");
  let borrowSpeed1 = utils.parseEther("5000");
  let supplySpeed0 = utils.parseEther("10000");
  let supplySpeed1 = utils.parseEther("10000");
  let user1, user2, user3;
  let account1, account2, account3;
  let amount0, amount1;
  let DF;
  let startBlock;

  before(async function () {
    ({
      controller,
      iToken0,
      iToken1,
      owner,
      accounts,
      priceOracle,
      rewardDistributor,
    } = await loadFixture(fixtureDefault));

    [user1, user2, user3] = accounts;
    account1 = await user1.getAddress();
    account2 = await user2.getAddress();
    account3 = await user3.getAddress();

    amount0 = await parseTokenAmount(iToken0, 1000);
    amount1 = await parseTokenAmount(iToken1, 1000);

    await controller
      .connect(user1)
      .enterMarkets([iToken0.address, iToken1.address]);
    await controller
      .connect(user2)
      .enterMarkets([iToken0.address, iToken1.address]);

    const Token = await ethers.getContractFactory("Token");
    DF = await Token.deploy("DF", "DF", 18);
    await DF.deployed();

    // Prepare reward
    await DF.mint(
      rewardDistributor.address,
      parseTokenAmount(DF, "10000000000")
    );
    await rewardDistributor._setRewardToken(DF.address);
  });

  it("Initial state should be paused and can not set global speed", async function () {
    expect(await rewardDistributor.paused()).to.equal(true);

    await expect(
      rewardDistributor._setDistributionSpeeds(
        [iToken0.address, iToken1.address],
        [borrowSpeed0, borrowSpeed1],
        [iToken0.address, iToken1.address],
        [supplySpeed0, supplySpeed1]
      )
    ).to.be.revertedWith("Can not change speeds when paused");
  });

  it("Should only allow owner to unpause", async function () {
    await verifyOnlyOwner(
      rewardDistributor, //contract
      "_unpause", // method
      [
        [iToken0.address, iToken1.address],
        [borrowSpeed0, borrowSpeed1],
        [iToken0.address, iToken1.address],
        [supplySpeed0, supplySpeed1],
      ], //args
      owner, // owner
      accounts[0], // non-owner
      "Paused", // ownerEvent
      [false], // ownerEventArgs
      // ownerChecks
      async () => {
        expect(await rewardDistributor.paused()).to.equal(false);
        expect(await rewardDistributor.globalDistributionSpeed()).to.equal(
          globalBorrowSpeed
        );
        expect(
          await rewardDistributor.globalDistributionSupplySpeed()
        ).to.equal(globalSupplySpeed);
      },
      // nonownerChecks
      async () => {
        expect(await rewardDistributor.paused()).to.equal(true);
        expect(await rewardDistributor.globalDistributionSpeed()).to.equal(0);
        expect(
          await rewardDistributor.globalDistributionSupplySpeed()
        ).to.equal(0);
      }
    );
  });

  it("Should only allow owner to pause", async function () {
    await verifyOnlyOwner(
      rewardDistributor, //contract
      "_pause", // method
      [], //args
      owner, // owner
      accounts[0], // non-owner
      "Paused", // ownerEvent
      [true], // ownerEventArgs
      // ownerChecks
      async () => {
        expect(await rewardDistributor.paused()).to.equal(true);
        expect(await rewardDistributor.globalDistributionSpeed()).to.equal(0);
      },
      // nonownerChecks
      async () => {
        expect(await rewardDistributor.paused()).to.equal(false);
        expect(await rewardDistributor.globalDistributionSpeed()).to.equal(
          globalBorrowSpeed
        );
        expect(
          await rewardDistributor.globalDistributionSupplySpeed()
        ).to.equal(globalSupplySpeed);
      }
    );
  });

  it("Should stop accumulation but claimable when paused", async function () {
    const blockDelta = 100;
    let block, borrowerIndex, reward;

    // Only 1 user mint/borrow
    await iToken0.connect(user1).mint(account1, amount0);
    await iToken0.connect(user1).borrow(amount0.div(2));

    startReward = await rewardDistributor.reward(account1);

    // Refresh the speed and token State at the last step for easy calculation
    await rewardDistributor._unpause(
      [iToken0.address, iToken1.address],
      [borrowSpeed0, borrowSpeed1],
      [iToken0.address, iToken1.address],
      [supplySpeed0, supplySpeed1]
    );

    await increaseBlock(blockDelta);

    // Both supply and borrow side,
    let expectedReward = (
      await rewardDistributor.distributionSpeed(iToken0.address)
    )
      .mul(blockDelta + 1) //_setPaused() will increase 1 block
      .add(
        (await rewardDistributor.distributionSupplySpeed(iToken0.address)).mul(
          blockDelta + 1
        )
      );

    let expectedBorrowReward = (
      await rewardDistributor.distributionSpeed(iToken0.address)
    ).mul(blockDelta + 1);

    await rewardDistributor._pause();

    ({
      block: block,
      index: borrowerIndex,
    } = await rewardDistributor.distributionBorrowState(iToken0.address));

    // Should not accumulated reward or update state when paused
    await increaseBlock(blockDelta);

    const repayAmount = utils.parseEther("10");

    // iToken interactions will accure interest, the borrow balance will increase
    await iToken0.connect(user1).repayBorrow(repayAmount);

    // the borrow balance stay the same
    // await controller.beforeBorrow(iToken0.address, account1, 0);

    // const currentBlock = await getBlockBN();

    // Should not update token state if paused
    expect(
      (await rewardDistributor.distributionBorrowState(iToken0.address)).block
    ).to.equal(block);

    // Should update borrowerIndex
    expect(
      await rewardDistributor.distributionBorrowerIndex(
        iToken0.address,
        account1
      )
    ).to.equal(borrowerIndex);

    // Should update reward for borrow
    expect(await rewardDistributor.reward(account1)).to.equal(
      expectedBorrowReward
    );

    // claimReward will claim both supply and borrow reward
    await expect(() =>
      rewardDistributor.claimReward([account1], [iToken0.address])
    ).changeTokenBalance(DF, user1, expectedReward);
  });

  it("Should not be able to update distribution speeds when paused", async function () {
    await expect(
      rewardDistributor._setDistributionSpeeds([], [], [], [])
    ).to.be.revertedWith("Can not change speeds when paused");

    let block = await getBlockBN();

    expect(await rewardDistributor.distributionSpeed(iToken0.address)).to.equal(
      0
    );
    expect(await rewardDistributor.distributionSpeed(iToken1.address)).to.equal(
      0
    );

    // The state should not be updated
    expect(
      (await rewardDistributor.distributionBorrowState(iToken0.address)).block
    ).to.not.equal(block);
    expect(
      (await rewardDistributor.distributionBorrowState(iToken0.address)).block
    ).to.not.equal(block);
    expect(
      (await rewardDistributor.distributionSupplyState(iToken1.address)).block
    ).to.not.equal(block);
    expect(
      (await rewardDistributor.distributionSupplyState(iToken1.address)).block
    ).to.not.equal(block);
  });

  it("Should start accumulating after unpause", async function () {
    const blockDelta = 100;

    let startBlock, startIndex, startReward;

    startBlock = (
      await rewardDistributor.distributionSupplyState(iToken0.address)
    ).block;

    startIndex = await rewardDistributor.distributionBorrowerIndex(
      iToken0.address,
      account1
    );

    // console.log((await iToken0.totalBorrows()).toString());
    // console.log((await iToken0.borrowIndex()).toString());

    startReward = await rewardDistributor.reward(account1);

    await rewardDistributor._unpause(
      [iToken0.address, iToken1.address],
      [borrowSpeed0, borrowSpeed1],
      [iToken0.address, iToken1.address],
      [supplySpeed0, supplySpeed1]
    );

    // All state should be updated
    await controller.beforeBorrow(iToken0.address, account1, 0);
    expect(
      (await rewardDistributor.distributionBorrowState(iToken0.address)).block
    ).to.not.equal(startBlock);
    expect(
      await rewardDistributor.distributionBorrowerIndex(
        iToken0.address,
        account1
      )
    ).to.not.equal(startIndex);
    expect(await rewardDistributor.reward(account1)).to.not.equal(startReward);

    // console.log((await rewardDistributor.reward(account1)).toString());

    // Should start accumulating reward after unpause
    await increaseBlock(blockDelta);

    let reward = (await rewardDistributor.distributionSpeed(iToken0.address))
      .mul(blockDelta + 2) // beforeBorrow() and claimReward() will increase 2 blocks
      .add(
        (await rewardDistributor.distributionSupplySpeed(iToken0.address)).mul(
          blockDelta + 2
        )
      )
      .add(startReward);

    let balanceBefore = (await DF.balanceOf(account1)).add(
      await DF.balanceOf(account2)
    );

    await rewardDistributor.claimReward([account1], [iToken0.address]);

    let balanceAfter = (await DF.balanceOf(account1)).add(
      await DF.balanceOf(account2)
    );

    // Now the reward index will take borrow index into account
    // There will be some rounding errors
    let error = reward.sub(balanceAfter.sub(balanceBefore));
    // console.log(error.toString());

    // Some arbitrary error allowance
    expect(error).to.lte(500);
  });
});
