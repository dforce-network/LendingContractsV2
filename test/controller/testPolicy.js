const { expect } = require("chai");
const { utils, BigNumber } = require("ethers");
const { deployMockContract } = waffle;

const {
  loadFixture,
  fixtureDefault,
  fixtureShortfall,
} = require("../helpers/fixtures.js");

const { setOraclePrices, parseTokenAmount } = require("../helpers/utils.js");

const Controller = require("../../artifacts/contracts/Controller.sol/Controller.json");

describe("Controller: Policy Hooks", function () {
  describe("beforeMint()/afterMint()", function () {
    it("Should be able check beforeMint()", async function () {
      const { controller, iToken0, accounts } = await loadFixture(
        fixtureDefault
      );
      const [other] = accounts;

      await controller.beforeMint(
        iToken0.address,
        await other.getAddress(),
        utils.parseEther("1000")
      );
    });

    it("Should fail in beforeMint() with non-listed market", async function () {
      const { controller, owner, accounts } = await loadFixture(fixtureDefault);
      const [other] = accounts;

      await expect(
        controller.beforeMint(
          await owner.getAddress(),
          await other.getAddress(),
          utils.parseEther("1000")
        )
      ).to.be.revertedWith("Token has not been listed");
    });

    it("Should fail in beforeMint() if it reaches supply capacity", async function () {
      const { controller, iToken0, accounts } = await loadFixture(
        fixtureDefault
      );
      const [other] = accounts;
      let account = await other.getAddress();

      // Set iToken0's supply capacity to 3000
      let capacity = utils.parseEther("3000");
      await controller._setSupplyCapacity(iToken0.address, capacity);

      let amount = capacity.add(1);
      await expect(
        controller.callStatic.beforeMint(iToken0.address, account, amount)
      ).to.be.revertedWith("Token supply capacity reached");
    });
  });

  describe("beforeRedeem()/afterRedeem()", function () {
    it("Should be able check beforeRedeem()", async function () {
      const { controller, iToken0, accounts } = await loadFixture(
        fixtureDefault
      );
      const [other] = accounts;

      await controller.beforeRedeem(
        iToken0.address,
        await other.getAddress(),
        utils.parseEther("1000")
      );
    });

    it("Should fail in beforeRedeem() with non-listed market", async function () {
      const { controller, owner, accounts } = await loadFixture(fixtureDefault);
      const [other] = accounts;

      await expect(
        controller.beforeRedeem(
          await owner.getAddress(),
          await other.getAddress(),
          utils.parseEther("1000")
        )
      ).to.be.revertedWith("Token has not been listed");
    });

    it("Should succeed in beforeRedeem() if has not entered market", async function () {
      const { controller, iToken0, accounts } = await loadFixture(
        fixtureDefault
      );
      const [other] = accounts;

      await controller.beforeRedeem(
        iToken0.address,
        await other.getAddress(),
        utils.parseEther("1001")
      );
    });

    it("Should revert in beforeRedeem() with some large redeem amount", async function () {
      const { controller, iToken0, accounts } = await loadFixture(
        fixtureDefault
      );
      const [other] = accounts;
      const account = await other.getAddress();

      let amount = utils.parseEther("1000");

      await iToken0.connect(other).mint(account, amount);

      // User use iToken0 as collateral
      await controller.connect(other).enterMarkets([iToken0.address]);
      await iToken0.connect(other).borrow(amount.div(2));

      await expect(
        controller.callStatic.beforeRedeem(
          iToken0.address,
          account,
          amount.div(2)
        )
      ).to.be.revertedWith("Account has some shortfall");
    });

    it("Should revert in beforeRedeem() with some drop of collateral assets", async function () {
      const { controller, iToken0, accounts } = await loadFixture(
        fixtureShortfall
      );

      // default shortfall drop collateral price to 0.5
      // equity = 1000 * 0.5 * 0.9 - 450 * 1 * 1 = 0
      await expect(
        controller.callStatic.beforeRedeem(
          iToken0.address,
          await accounts[0].getAddress(),
          1
        )
      ).to.be.revertedWith("Account has some shortfall");
    });

    it("Should revert in beforeRedeem() if token price is unavailable in controllerV2", async function () {
      const {
        controllerV2,
        iToken0,
        mockPriceOracle,
        accounts,
      } = await loadFixture(fixtureDefault);
      const [other] = accounts;
      let account = await other.getAddress();
      let amount = utils.parseEther("1000");

      // Use controllerV2
      await iToken0._setController(controllerV2.address);

      // Use mock oracle
      await controllerV2._setPriceOracle(mockPriceOracle.address);

      // Now use iToken0 as collateral
      await iToken0.connect(other).mint(account, amount);
      await controllerV2.connect(other).enterMarkets([iToken0.address]);

      const signer = await ethers.provider.getSigner(iToken0.address);

      // iToken0 Price is unavailable
      await setOraclePrices(mockPriceOracle, [iToken0], [0]);

      await expect(
        controllerV2
          .connect(signer)
          .callStatic.beforeRedeem(
            iToken0.address,
            await other.getAddress(),
            amount
          )
      ).to.be.revertedWith("Invalid price to calculate account equity");

      // iToken0 Price is invalid
      await setOraclePrices(mockPriceOracle, [iToken0], [1], [false]);

      await expect(
        controllerV2
          .connect(signer)
          .callStatic.beforeRedeem(
            iToken0.address,
            await other.getAddress(),
            amount
          )
      ).to.be.revertedWith("Invalid price to calculate account equity");
    });
  });

  describe("beforeBorrow()/afterBorrow()", function () {
    before(async function () {
      // beforeBorrow() is only allowed to be called by iToken0
      // So impersonate it
      const { iToken0 } = await loadFixture(fixtureDefault);
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [iToken0.address],
      });
    });

    it("Should be able check beforeBorrow()", async function () {
      const { controller, iToken0, accounts } = await loadFixture(
        fixtureDefault
      );
      const [other] = accounts;
      let account = await other.getAddress();
      const signer = await ethers.provider.getSigner(iToken0.address);

      await iToken0.connect(other).mint(account, utils.parseEther("1000"));
      await controller.connect(other).enterMarkets([iToken0.address]);

      await controller
        .connect(signer)
        .callStatic.beforeBorrow(
          iToken0.address,
          await other.getAddress(),
          utils.parseEther("10")
        );
    });

    it("Should fail in beforeBorrow() with non-listed market", async function () {
      const { controller, owner, accounts } = await loadFixture(fixtureDefault);
      const [other] = accounts;

      await expect(
        controller.beforeBorrow(
          await owner.getAddress(),
          await other.getAddress(),
          utils.parseEther("1000")
        )
      ).to.be.revertedWith("Token has not been listed");
    });

    it("Should fail in beforeBorrow() if token price is unavailable", async function () {
      const {
        controller,
        iToken0,
        mockPriceOracle,
        accounts,
      } = await loadFixture(fixtureDefault);
      const [other] = accounts;
      let account = await other.getAddress();
      let amount = utils.parseEther("1000");

      // Use mock oracle
      await controller._setPriceOracle(mockPriceOracle.address);

      // Now use iToken0 as collateral
      await iToken0.connect(other).mint(account, amount);
      await controller.connect(other).enterMarkets([iToken0.address]);

      const signer = await ethers.provider.getSigner(iToken0.address);

      // iToken0 Price is unavailable
      await setOraclePrices(mockPriceOracle, [iToken0], [0]);

      await expect(
        controller
          .connect(signer)
          .callStatic.beforeBorrow(
            iToken0.address,
            await other.getAddress(),
            amount
          )
      ).to.be.revertedWith("Invalid price to calculate account equity");
    });

    it("Should fail in beforeBorrow() if token price is unavailable in controllerV2", async function () {
      const {
        controllerV2,
        iToken0,
        mockPriceOracle,
        accounts,
      } = await loadFixture(fixtureDefault);
      const [other] = accounts;
      let account = await other.getAddress();
      let amount = utils.parseEther("1000");

      // Use controllerV2
      await iToken0._setController(controllerV2.address);

      // Use mock oracle
      await controllerV2._setPriceOracle(mockPriceOracle.address);

      // Now use iToken0 as collateral
      await iToken0.connect(other).mint(account, amount);
      await controllerV2.connect(other).enterMarkets([iToken0.address]);

      const signer = await ethers.provider.getSigner(iToken0.address);

      // iToken0 Price is invalid
      await setOraclePrices(mockPriceOracle, [iToken0], [1], [false]);

      await expect(
        controllerV2
          .connect(signer)
          .callStatic.beforeBorrow(
            iToken0.address,
            await other.getAddress(),
            amount
          )
      ).to.be.revertedWith("Invalid price to calculate account equity");
    });

    it("Should fail in beforeBorrow() if called by non-iToken for the 1st time", async function () {
      const { controller, iToken0, accounts } = await loadFixture(
        fixtureDefault
      );
      const [other] = accounts;
      let account = await other.getAddress();
      let amount = utils.parseEther("1000");

      // Now use iToken0 as collateral
      await iToken0.connect(other).mint(account, amount);
      await controller.connect(other).enterMarkets([iToken0.address]);

      await expect(
        controller.beforeBorrow(
          iToken0.address,
          await other.getAddress(),
          amount
        )
      ).to.be.revertedWith("sender must be iToken");
    });

    it("Should fail in beforeBorrow() with some large borrow amount", async function () {
      const { controller, iToken0, accounts } = await loadFixture(
        fixtureDefault
      );
      const [other] = accounts;
      let account = await other.getAddress();
      let amount = utils.parseEther("1000");

      const signer = await ethers.provider.getSigner(iToken0.address);

      // Have no asset as collateral yet
      await expect(
        controller
          .connect(signer)
          .callStatic.beforeBorrow(
            iToken0.address,
            account,
            utils.parseEther("1")
          )
      ).to.be.revertedWith("Account has some shortfall");

      // Now use iToken0 as collateral
      await iToken0.connect(other).mint(account, amount);
      await controller.connect(other).enterMarkets([iToken0.address]);

      await expect(
        controller
          .connect(signer)
          .callStatic.beforeBorrow(
            iToken0.address,
            await other.getAddress(),
            amount
          )
      ).to.be.revertedWith("Account has some shortfall");
    });

    it("Should fail in beforeBorrow() if it reaches borrow capacity", async function () {
      const {
        controller,
        iToken0,
        mockPriceOracle,
        accounts,
      } = await loadFixture(fixtureDefault);
      const [other] = accounts;
      let account = await other.getAddress();
      let amount = utils.parseEther("10000");

      // Now use iToken0 as collateral
      await iToken0.connect(other).mint(account, amount);
      await controller.connect(other).enterMarkets([iToken0.address]);

      // Set iToken0's borrow capacity to 3000
      let capacity = utils.parseEther("3000");
      await controller._setBorrowCapacity(iToken0.address, capacity);

      // Try to borrow 5000
      const signer = await ethers.provider.getSigner(iToken0.address);
      await expect(
        controller
          .connect(signer)
          .callStatic.beforeBorrow(iToken0.address, account, amount.div(2))
      ).to.be.revertedWith("Token borrow capacity reached");
    });

    after(async function () {
      // Stop impersonating iToken0
      const { iToken0 } = await loadFixture(fixtureDefault);
      await hre.network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [iToken0.address],
      });
    });
  });

  describe("beforeRepayBorrow()/afterRepayBorrow()", function () {
    it("Should be able check beforeRepayBorrow()", async function () {
      const { controller, iToken0, accounts } = await loadFixture(
        fixtureDefault
      );
      const [other1, other2] = accounts;

      await controller.beforeRepayBorrow(
        iToken0.address,
        await other1.getAddress(),
        await other2.getAddress(),
        utils.parseEther("1000")
      );
    });

    it("Should fail in beforeRepayBorrow() with non-listed market", async function () {
      const { controller, owner, accounts } = await loadFixture(fixtureDefault);
      const [other1, other2] = accounts;

      await expect(
        controller.beforeRepayBorrow(
          await owner.getAddress(),
          await other1.getAddress(),
          await other2.getAddress(),
          utils.parseEther("1000")
        )
      ).to.be.revertedWith("Token has not been listed");
    });

    it("Should fail in afterRepayBorrow() with non-listed market", async function () {
      const { controller, owner, accounts } = await loadFixture(fixtureDefault);
      const [other1, other2] = accounts;

      await expect(
        controller.afterRepayBorrow(
          await owner.getAddress(),
          await other1.getAddress(),
          await other2.getAddress(),
          utils.parseEther("1000")
        )
      ).to.be.revertedWith("Token has not been listed");
    });

    it("Should fail in afterRepayBorrow() when called by non-iToken", async function () {
      const { controller, iToken0, accounts } = await loadFixture(
        fixtureDefault
      );
      const [other1, other2] = accounts;

      await expect(
        controller.afterRepayBorrow(
          await iToken0.address,
          await other1.getAddress(),
          await other2.getAddress(),
          utils.parseEther("1000")
        )
      ).to.be.revertedWith("sender must be iToken");
    });
  });

  describe("beforeLiquidateBorrow()/afterLiquidateBorrow()", function () {
    it("Should be able check beforeLiquidateBorrow()", async function () {
      const { controller, iToken0, accounts } = await loadFixture(
        fixtureDefault
      );
      const [other1, other2] = accounts;

      // User have not borrow any asset
      await expect(
        controller.callStatic.beforeLiquidateBorrow(
          iToken0.address,
          iToken0.address,
          await other1.getAddress(),
          await other2.getAddress(),
          utils.parseEther("1000")
        )
      ).to.be.revertedWith("Account does not have shortfall");
    });

    it("Should fail in beforeLiquidateBorrow() with non-listed market", async function () {
      const { controller, owner, accounts } = await loadFixture(fixtureDefault);
      const [other1, other2] = accounts;

      await expect(
        controller.beforeLiquidateBorrow(
          await owner.getAddress(),
          await owner.getAddress(),
          await other1.getAddress(),
          await other2.getAddress(),
          utils.parseEther("1000")
        )
      ).to.be.revertedWith("Tokens have not been listed");
    });

    it("Should return false in beforeLiquidateBorrow() with no shortfall borrower", async function () {
      const { controller, iToken0, accounts } = await loadFixture(
        fixtureDefault
      );
      const [other1, other2] = accounts;

      await controller.connect(other2).enterMarkets([iToken0.address]);

      await expect(
        controller.callStatic.beforeLiquidateBorrow(
          iToken0.address,
          iToken0.address,
          await other1.getAddress(),
          await other2.getAddress(),
          utils.parseEther("1000")
        )
      ).to.be.revertedWith("Account does not have shortfall");
    });

    it("Should return correct value in beforeLiquidateBorrow() with some shortfall", async function () {
      // const {
      //   controller,
      //   iToken0,
      //   iToken1,
      //   accounts,
      //   mockPriceOracle,
      // } = await loadFixture(fixtureShortfall);

      const {
        controller,
        iToken0,
        iToken1,
        mockPriceOracle,
        accounts,
      } = await loadFixture(fixtureDefault);

      const [user0, user1] = accounts;
      const account0 = await user0.getAddress();
      const account1 = await user1.getAddress();

      // Use mock oracle
      await controller._setPriceOracle(mockPriceOracle.address);

      let rawAmount = BigNumber.from("1000");
      const iToken0Decimals = await iToken0.decimals();
      const iToken1Decimals = await iToken1.decimals();
      let mintiToken0Amount = rawAmount.mul(
        BigNumber.from(10).pow(iToken0Decimals)
      );
      let mintiToken1Amount = rawAmount.mul(
        BigNumber.from(10).pow(iToken1Decimals)
      );
      let amount = mintiToken0Amount;

      await iToken0.connect(user0).mint(account0, amount);
      await iToken1.connect(user1).mint(account1, mintiToken1Amount);

      // User use iToken0 as collateral, and borrow some underlying1
      await controller
        .connect(user0)
        .enterMarkets([iToken0.address, iToken1.address]);
      await iToken1
        .connect(user0)
        .borrow(mintiToken1Amount.div(2).mul(9).div(10));
      borrowBalance = await iToken1.borrowBalanceStored(account0);

      //console.log("Borrow Balance:", borrowBalance.toString());

      // underlying0 price drop to 0.5
      await setOraclePrices(mockPriceOracle, [iToken0], [0.5]);

      // const [user0, user1] = accounts;
      // const account0 = await user0.getAddress();
      // const account1 = await user1.getAddress();

      // borrowBalance = (await iToken1.borrowBalanceStored(account0));
      // console.log("Borrow Balance:", borrowBalance.toString());

      // equity = 1000 * 0.5 * 0.9 - 450 * 1 * 1 = 0
      await expect(
        controller.callStatic.beforeLiquidateBorrow(
          iToken0.address,
          iToken1.address,
          account1,
          account0,
          utils.parseEther("1000")
        )
      ).to.be.revertedWith("Account does not have shortfall");

      // underlying0 price drop to 0.3
      // equity = 1000 * 0.3 * 0.9 - 450 * 1 * 1 = -18
      await setOraclePrices(mockPriceOracle, [iToken0], [0.3]);

      // Try to liquidate up to max repay amount borrow balance * 0.5
      borrowBalance = await iToken1.callStatic.borrowBalanceStored(account0);
      let repay = borrowBalance.div(2);

      await controller.callStatic.beforeLiquidateBorrow(
        iToken1.address,
        iToken0.address,
        account1,
        account0,
        repay
      );

      // Now slightly more than max repay
      await expect(
        controller.callStatic.beforeLiquidateBorrow(
          iToken1.address,
          iToken0.address,
          account1,
          account0,
          repay.add(1)
        )
      ).to.be.revertedWith("Repay exceeds max repay allowed");
    });
  });

  describe("beforeSeize()/afterSeize()", function () {
    it("Should be able check beforeSeize()", async function () {
      const { controller, iToken0, accounts } = await loadFixture(
        fixtureDefault
      );
      const [other1, other2] = accounts;

      await controller.beforeSeize(
        iToken0.address,
        iToken0.address,
        await other1.getAddress(),
        await other2.getAddress(),
        utils.parseEther("1000")
      );
    });

    it("Should fail in beforeSeize() with non-listed market", async function () {
      const { controller, owner, accounts } = await loadFixture(fixtureDefault);
      const [other1, other2] = accounts;

      await expect(
        controller.beforeSeize(
          await owner.getAddress(),
          await owner.getAddress(),
          await other1.getAddress(),
          await other2.getAddress(),
          utils.parseEther("1000")
        )
      ).to.be.revertedWith("Tokens have not been listed");
    });

    it("Should fail in beforeSeize() with mismatched controller iToken", async function () {
      const {
        controller,
        owner,
        accounts,
        iToken0,
        iToken1,
      } = await loadFixture(fixtureDefault);
      const [other1, other2] = accounts;

      let mockController = await deployMockContract(owner, Controller.abi);
      await mockController.mock.isController.returns(true);
      await iToken1._setController(mockController.address);

      await expect(
        controller.beforeSeize(
          iToken0.address,
          iToken1.address,
          await other1.getAddress(),
          await other2.getAddress(),
          utils.parseEther("1000")
        )
      ).to.be.revertedWith(
        "Controller mismatch between Borrowed and Collateral"
      );
    });

    // it("Should fail in beforeSeize() with some large seize amount", async function () {
    //   const { controller, iToken0, accounts } = await loadFixture(
    //     fixtureDefault
    //   );
    //   const [other1, other2] = accounts;

    //   await controller.connect(other2).enterMarkets([iToken0.address]);

    //   await expect(
    //     controller.beforeSeize(
    //       iToken0.address,
    //       iToken0.address,
    //       await other1.getAddress(),
    //       await other2.getAddress(),
    //       utils.parseEther("1001")
    //     )
    //   ).to.be.revertedWith("Not enough liquidity");
    // });
  });

  describe("beforeTransfer()/afterTransfer()", function () {
    it("Should be able check beforeTransfer()", async function () {
      const { controller, iToken0, accounts } = await loadFixture(
        fixtureDefault
      );
      const [account1, account2] = accounts;

      let amount = utils.parseEther("1000");
      await iToken0.connect(account1).mint(await account1.getAddress(), amount);

      await controller.callStatic.beforeTransfer(
        iToken0.address,
        await account1.getAddress(),
        await account2.getAddress(),
        amount
      );
    });

    it("Should fail in beforeTransfer() with non-listed market", async function () {
      const { controller, owner, accounts } = await loadFixture(fixtureDefault);
      const [other1, other2] = accounts;

      await expect(
        controller.beforeTransfer(
          await owner.getAddress(),
          await other1.getAddress(),
          await other2.getAddress(),
          utils.parseEther("1000")
        )
      ).to.be.revertedWith("Token has not been listed");
    });

    it("Should fail in beforeTransfer() with some large transfer amount", async function () {
      const { controller, iToken0, iToken1, accounts } = await loadFixture(
        fixtureDefault
      );
      const [account1, account2] = accounts;

      let rawAmount = BigNumber.from("1000");
      const iToken0Decimals = await iToken0.decimals();
      const iToken1Decimals = await iToken1.decimals();
      let mintiToken0Amount = rawAmount.mul(
        BigNumber.from(10).pow(iToken0Decimals)
      );
      let mintiToken1Amount = rawAmount.mul(
        BigNumber.from(10).pow(iToken1Decimals)
      );
      let amount = mintiToken0Amount;
      await iToken0.connect(account1).mint(await account1.getAddress(), amount);

      await iToken1
        .connect(account2)
        .mint(await account1.getAddress(), mintiToken1Amount);

      await controller.connect(account1).enterMarkets([iToken0.address]);
      await iToken1.connect(account1).borrow(mintiToken1Amount.div(10));

      await expect(
        controller.callStatic.beforeTransfer(
          iToken0.address,
          await account1.getAddress(),
          await account2.getAddress(),
          amount
        )
      ).to.be.revertedWith("Account has some shortfall");
    });

    it("Should fail in beforeTransfer() if account's any asset price is invalid in controllerV2", async function () {
      const {
        controllerV2,
        iToken0,
        iToken1,
        accounts,
        mockPriceOracle,
      } = await loadFixture(fixtureDefault);
      const [account1, account2] = accounts;

      // Use controllerV2
      await iToken0._setController(controllerV2.address);
      await iToken1._setController(controllerV2.address);

      // Use mock oracle
      await controllerV2._setPriceOracle(mockPriceOracle.address);

      let rawAmount = BigNumber.from("1000");
      let mintiToken0Amount = await parseTokenAmount(iToken0, rawAmount);
      let mintiToken1Amount = await parseTokenAmount(iToken1, rawAmount);
      let amount = mintiToken0Amount;

      await iToken0
        .connect(account1)
        .mint(await account1.getAddress(), mintiToken0Amount);

      await iToken1
        .connect(account2)
        .mint(await account1.getAddress(), mintiToken1Amount);

      await controllerV2.connect(account1).enterMarkets([iToken0.address]);
      await iToken1.connect(account1).borrow(mintiToken1Amount.div(10));

      let caseArgs = [
        [
          [iToken0, iToken1],
          [1, 0],
          [true, true],
        ],
        [
          [iToken0, iToken1],
          [1, 1],
          [false, true],
        ],
        [
          [iToken0, iToken1],
          [0, 1],
          [true, true],
        ],
        [
          [iToken0, iToken1],
          [1, 1],
          [true, false],
        ],
      ];

      for (args of caseArgs) {
        await setOraclePrices(mockPriceOracle, ...args);
        await expect(
          controllerV2.beforeTransfer(
            iToken0.address,
            await account1.getAddress(),
            await account2.getAddress(),
            amount
          )
        ).to.revertedWith("Invalid price to calculate account equity");
      }
    });
  });

  describe("beforeFlashloan()/afterFlashloan()", function () {
    it("Should be able check beforeFlashloan()", async function () {
      const { controller, iToken0, accounts } = await loadFixture(
        fixtureDefault
      );
      const [account1, account2] = accounts;

      let amount = utils.parseEther("1000000000");

      await controller.callStatic.beforeFlashloan(
        iToken0.address,
        await account1.getAddress(),
        amount
      );
    });

    it("Should fail in beforeFlashloan() with non-listed market", async function () {
      const { controller, owner, accounts } = await loadFixture(fixtureDefault);
      const [other1, other2] = accounts;

      let amount = utils.parseEther("1000000000");

      await expect(
        controller.beforeFlashloan(
          await owner.getAddress(),
          await other1.getAddress(),
          amount
        )
      ).to.be.revertedWith("Token has not been listed");
    });
  });
});
