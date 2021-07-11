const { expect } = require("chai");
const { utils, BigNumber } = require("ethers");

const {
  parseTokenAmount,
  formatTokenAmount,
  setOraclePrices,
} = require("../helpers/utils.js");

const {
  loadFixture,
  fixtureDefault,
  fixtureShortfall,
} = require("../helpers/fixtures.js");

describe("Controller: Account", function () {
  describe("Assets list", function () {
    describe("Collateral Assets", function () {
      describe("Enter Markets", function () {
        it("Should be able to enter markets", async function () {
          const { controller, iToken0, accounts } = await loadFixture(
            fixtureDefault
          );
          const [other] = accounts;

          await expect(
            controller.connect(other).enterMarkets([iToken0.address])
          )
            .to.emit(controller, "MarketEntered")
            .withArgs(iToken0.address, await other.getAddress());
        });

        it("Should be able to get entered markets", async function () {
          const { controller, iToken0, accounts } = await loadFixture(
            fixtureDefault
          );
          const [other] = accounts;

          // Check the returned value from static call first
          let entered = await controller
            .connect(other)
            .callStatic.enterMarkets([iToken0.address]);
          expect(entered).to.eql([true]);

          await controller.connect(other).enterMarkets([iToken0.address]);
          let markets = await controller.getEnteredMarkets(
            await other.getAddress()
          );

          // To check the deep equality of address array here, for further info:
          // https://medium.com/building-ibotta/testing-arrays-and-objects-with-chai-js-4b372310fe6d
          expect(markets).to.eql([iToken0.address]);
        });

        it("Should be able to check whether has entered market", async function () {
          const { controller, iToken0, accounts } = await loadFixture(
            fixtureDefault
          );
          const [other] = accounts;

          await controller.connect(other).enterMarkets([iToken0.address]);

          expect(
            await controller.hasEnteredMarket(
              await other.getAddress(),
              iToken0.address
            )
          ).to.equal(true);

          expect(
            await controller.hasEnteredMarket(
              await other.getAddress(),
              controller.address
            )
          ).to.equal(false);
        });

        it("Should fail when enter non-listed markets", async function () {
          const { controller, iToken0, accounts } = await loadFixture(
            fixtureDefault
          );
          const [user1, user2] = accounts;
          const account1 = await user1.getAddress();
          const account2 = await user2.getAddress();

          // Pretend account2 is a non-listed market
          // should return false
          expect(
            await controller.connect(user1).callStatic.enterMarkets([account2])
          ).to.eql([false]);

          // Also check hasEnteredMarket()
          expect(
            await controller.connect(user1).hasEnteredMarket(account1, account2)
          ).to.equal(false);
        });

        it("Should not emit event when enter market again", async function () {
          const { controller, iToken0, accounts } = await loadFixture(
            fixtureDefault
          );
          const [user1, user2] = accounts;

          await controller.connect(user1).enterMarkets([iToken0.address]);

          // Should check whether event is emitted, now waffle has no such matcher
          // await expect(
          //   controller.connect(user1).enterMarkets([iToken0.address])
          // ).to.emit(controller, "MarketEntered");

          // Should return true as it has entered already
          expect(
            await controller
              .connect(user1)
              .callStatic.enterMarkets([iToken0.address])
          ).to.eql([true]);
        });
      });

      describe("Exit Markets", function () {
        it("Should be able to exit markets", async function () {
          const { controller, iToken0, accounts } = await loadFixture(
            fixtureDefault
          );
          const [other] = accounts;
          const account = await other.getAddress();

          // Enter market first
          await controller.connect(other).enterMarkets([iToken0.address]);
          expect(
            await controller.hasEnteredMarket(account, iToken0.address)
          ).to.equal(true);

          // Exit with event emitted
          await expect(controller.connect(other).exitMarkets([iToken0.address]))
            .to.emit(controller, "MarketExited")
            .withArgs(iToken0.address, account);

          // Check the hasEnteredMarket() to false
          expect(
            await controller.hasEnteredMarket(account, iToken0.address)
          ).to.equal(false);

          // Also check the getEnteredMarkets() list
          let markets = await controller.getEnteredMarkets(account);
          expect(markets).to.eql([]);
        });

        it("Should be able to exit non-listed markets", async function () {
          const { controller, iToken0, accounts } = await loadFixture(
            fixtureDefault
          );
          const [user1, user2] = accounts;
          const account1 = await user1.getAddress();
          const account2 = await user2.getAddress();

          // Pretend is account2 is a non-listed market
          // Should return true, though it is confusing
          expect(
            await controller.connect(user1).callStatic.exitMarkets([account2])
          ).to.eql([true]);
        });

        it("Should be able to exit non-entered markets", async function () {
          const { controller, iToken0, accounts } = await loadFixture(
            fixtureDefault
          );
          const [user1] = accounts;

          // Should return true
          expect(
            await controller
              .connect(user1)
              .callStatic.exitMarkets([iToken0.address])
          ).to.eql([true]);
        });
      });
    });

    describe("Borrowed Assets", async function () {
      let controller, iToken0, iToken1;
      let user0, account0;
      let rawAmount = BigNumber.from("1000");
      let mintiToken0Amount, mintiToken1Amount, amount;

      before(async function () {
        ({ controller, iToken0, iToken1, accounts } = await loadFixture(
          fixtureDefault
        ));
        const iToken0Decimals = await iToken0.decimals();
        const iToken1Decimals = await iToken1.decimals();
        mintiToken0Amount = rawAmount.mul(
          BigNumber.from(10).pow(iToken0Decimals)
        );
        mintiToken1Amount = rawAmount.mul(
          BigNumber.from(10).pow(iToken1Decimals)
        );
        amount = mintiToken0Amount;

        [user0] = accounts;
        account0 = await user0.getAddress();

        await iToken0.connect(user0).mint(account0, amount);
        await iToken1.connect(user0).mint(account0, mintiToken1Amount);

        // User use iToken0 as collateral
        await controller.connect(user0).enterMarkets([iToken0.address]);
      });

      it("Should be able to get borrowed list", async function () {
        // Borrow some underlying0
        await expect(iToken0.connect(user0).borrow(amount.div(10)))
          .to.emit(controller, "BorrowedAdded")
          .withArgs(iToken0.address, account0);

        // Check the hasBorrowed()
        expect(
          await controller.hasBorrowed(account0, iToken0.address)
        ).to.equal(true);

        // Borrow some underlying1
        await expect(iToken1.connect(user0).borrow(mintiToken1Amount.div(10)))
          .to.emit(controller, "BorrowedAdded")
          .withArgs(iToken1.address, account0);

        // Check the hasBorrowed()
        expect(
          await controller.hasBorrowed(account0, iToken1.address)
        ).to.equal(true);

        // Check the Borrowed list
        expect(await controller.getBorrowedAssets(account0)).to.have.members([
          iToken0.address,
          iToken1.address,
        ]);
      });

      it("Should be able to remove from borrowed list if all paid off", async function () {
        // Now paid off
        await expect(
          iToken0.connect(user0).repayBorrow(ethers.constants.MaxUint256)
        )
          .to.emit(controller, "BorrowedRemoved")
          .withArgs(iToken0.address, account0);

        // Check the hasBorrowed()
        expect(
          await controller.hasBorrowed(account0, iToken0.address)
        ).to.equal(false);

        // Check the Borrowed list
        expect(await controller.getBorrowedAssets(account0)).to.eql([
          iToken1.address,
        ]);
      });
    });
  });

  describe("Account Equity", function () {
    describe("Liquidate Calculate Seize Tokens", function () {
      let cases = [
        [1, 1, 1, 1],
        [1, 1, 1, 1],
        [2, 1.42, 1.3, 2.45],
        [5.230480842, 771.32, 1.3, 10002.45],
        [
          2527872.6317240445,
          261771.12093242585,
          1.179713989619784,
          7790468.414639561,
        ],
      ];

      cases.forEach((testCase) => {
        it(`returns the correct value for ${testCase}`, async () => {
          const {
            controller,
            priceOracle,
            iToken0,
            iToken1,
          } = await loadFixture(fixtureDefault);

          let [
            borrowedPrice,
            collateralPrice,
            liquidationIncentive,
            repayAmount,
          ] = testCase;

          await setOraclePrices(
            priceOracle,
            [iToken0, iToken1],
            [borrowedPrice, collateralPrice]
          );

          const price0 = await priceOracle.getUnderlyingPrice(iToken0.address);
          const price1 = await priceOracle.getUnderlyingPrice(iToken1.address);

          liquidationIncentive = utils.parseEther(
            liquidationIncentive.toString()
          );
          repayAmount = await parseTokenAmount(iToken0, repayAmount);
          await controller._setLiquidationIncentive(liquidationIncentive);
          let seized = await controller.liquidateCalculateSeizeTokens(
            iToken0.address,
            iToken1.address,
            repayAmount
          );

          let exchangeRate1 = await iToken1.exchangeRateStored();

          let expected = repayAmount
            .mul(liquidationIncentive)
            .div(utils.parseEther("1"))
            .mul(price0)
            .div(price1)
            .mul(utils.parseEther("1"))
            .div(exchangeRate1);

          expect(seized).to.equal(expected);
        });
      });

      it("Should revert if either underlying price is unavailable", async function () {
        const {
          controller,
          mockPriceOracle,
          iToken0,
          iToken1,
        } = await loadFixture(fixtureDefault);

        // Use mock oracle
        await controller._setPriceOracle(mockPriceOracle.address);

        await setOraclePrices(mockPriceOracle, [iToken0], [0]);

        let repayAmount = await parseTokenAmount(iToken0, 100);
        await expect(
          controller.liquidateCalculateSeizeTokens(
            iToken0.address,
            iToken1.address,
            repayAmount
          )
        ).to.revertedWith("Borrowed or Collateral asset price is invalid");

        // Set some price for iToken0
        await setOraclePrices(mockPriceOracle, [iToken0, iToken1], [1, 0]);

        await expect(
          controller.liquidateCalculateSeizeTokens(
            iToken0.address,
            iToken1.address,
            repayAmount
          )
        ).to.revertedWith("Borrowed or Collateral asset price is invalid");
      });

      it("Should revert if either underlying price is unavailable in ControllerV2", async function () {
        const {
          controllerV2,
          mockPriceOracle,
          iToken0,
          iToken1,
        } = await loadFixture(fixtureDefault);
        let repayAmount = await parseTokenAmount(iToken0, 100);

        // Use controllerV2
        await iToken0._setController(controllerV2.address);
        await iToken1._setController(controllerV2.address);

        // Use mock oracle
        await controllerV2._setPriceOracle(mockPriceOracle.address);

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

        // Set some price for iToken0
        await setOraclePrices(mockPriceOracle, [iToken0, iToken1], [1, 0]);
        for (args of caseArgs) {
          await setOraclePrices(mockPriceOracle, ...args);
          await expect(
            controllerV2.liquidateCalculateSeizeTokens(
              iToken0.address,
              iToken1.address,
              repayAmount
            )
          ).to.revertedWith("Borrowed or Collateral asset price is invalid");
        }
      });
    });

    describe("Calculate Account Equity", async function () {
      let controller, controllerV2, iToken0, iToken1;
      let user1, user2, account1, account2;
      let priceOracle, mockPriceOracle;

      before(async function () {
        ({
          controller,
          controllerV2,
          iToken0,
          iToken1,
          priceOracle,
          mockPriceOracle,
          accounts,
        } = await loadFixture(fixtureDefault));

        [user1, user2] = accounts;
        account1 = await user1.getAddress();
        account2 = await user2.getAddress();

        await controller.connect(user1).enterMarkets([iToken0.address]);
      });

      it("Should get correct account equity with initial mint()", async function () {
        let amount = await parseTokenAmount(iToken0, 100);
        let price = await priceOracle.getUnderlyingPrice(iToken0.address);
        //console.log(price.toString());

        await iToken0.connect(user1).mint(account1, amount);

        let exchangeRate = await iToken0.exchangeRateStored();
        // console.log(exchangeRate.toString());

        let balance = await iToken0.balanceOf(account1);
        // console.log(
        //   "balance of account",
        //   await formatTokenAmount(iToken0, balance)
        // );

        // The default collateral factor is 0.9
        let expected = balance
          .mul(price)
          .mul(exchangeRate)
          .div(utils.parseEther("1"))
          .mul(9)
          .div(10);

        let equity = await controller.calcAccountEquity(account1);

        expect(equity[0]).to.equal(expected);
        expect(equity[1]).to.equal(0);
      });

      it("Should get correct account equity followed by a redeem()", async function () {
        let redeemAmount = await parseTokenAmount(iToken0, 20);
        let price = await priceOracle.getUnderlyingPrice(iToken0.address);
        let exchangeRate = await iToken0.exchangeRateStored();

        let equity = await controller.calcAccountEquity(account1);

        await iToken0.connect(user1).redeem(account1, redeemAmount);

        // The default collateral factor is 0.9
        let redeemedValue = redeemAmount
          .mul(price)
          .mul(exchangeRate)
          .div(utils.parseEther("1"))
          .mul(9)
          .div(10);
        let expected = equity[0].sub(redeemedValue);
        equity = await controller.calcAccountEquity(account1);

        expect(equity[0]).to.equal(expected);
        expect(equity[1]).to.equal(0);
      });

      it("Should get correct account equity followed by another borrow()", async function () {
        let borrowAmount = await parseTokenAmount(iToken0, 10);
        let price = await priceOracle.getUnderlyingPrice(iToken0.address);
        let equity = await controller.calcAccountEquity(account1);

        await iToken0.connect(user1).borrow(borrowAmount);

        // default borrow factor is 1.0
        let borrowedValue = borrowAmount.mul(price);
        let expected = equity[0].sub(borrowedValue);
        equity = await controller.calcAccountEquity(account1);

        expect(equity[0]).to.equal(expected);
        expect(equity[1]).to.equal(0);
      });

      it("Should get correct account equity followed by a price drop", async function () {
        await setOraclePrices(priceOracle, [iToken0], [0.5]);
        let price = await priceOracle.getUnderlyingPrice(iToken0.address);

        let balance = await iToken0.balanceOf(account1);
        let borrowBalance = await iToken0.borrowBalanceStored(account1);
        let exchangeRate = await iToken0.exchangeRateStored();

        let expected = balance
          .mul(price)
          .mul(exchangeRate)
          .div(utils.parseEther("1"))
          .mul(9)
          .div(10)
          .sub(borrowBalance.mul(price));
        let equity = await controller.calcAccountEquity(account1);

        expect(equity[0]).to.equal(expected);
        expect(equity[1]).to.equal(0);
      });

      it("Should get correct account equity after changing collateral factor", async function () {
        let price = await priceOracle.getUnderlyingPrice(iToken0.address);
        let balance = await iToken0.balanceOf(account1);
        let borrowBalance = await iToken0.borrowBalanceStored(account1);
        let exchangeRate = await iToken0.exchangeRateStored();

        // collateral factor = 0.8
        let newCollateralFactor = ethers.utils.parseUnits("0.8", 18);
        await controller._setCollateralFactor(
          iToken0.address,
          newCollateralFactor
        );

        let expected = balance
          .mul(price)
          .mul(exchangeRate)
          .div(utils.parseEther("1"))
          .mul(8)
          .div(10)
          .sub(borrowBalance.mul(price));
        let equity = await controller.calcAccountEquity(account1);

        expect(equity[0]).to.equal(expected);
        expect(equity[1]).to.equal(0);
      });

      it("Should get correct account equity after a price rise of borrowed assets", async function () {
        let exchangeRate = await iToken0.exchangeRateStored();
        let price0 = await priceOracle.getUnderlyingPrice(iToken0.address);

        // User2 deposit some token1 for user1 to borrow
        let mintAmount = await parseTokenAmount(iToken1, 100);
        let borrowAmount = await parseTokenAmount(iToken1, 10);

        await iToken1.connect(user2).mint(account2, mintAmount);
        await iToken1.connect(user1).borrow(borrowAmount);

        // price of token1 rises to 5
        await setOraclePrices(priceOracle, [iToken1], [5]);
        let price1 = await priceOracle.getUnderlyingPrice(iToken1.address);

        // collateral factor = 0.8
        let balance = await iToken0.balanceOf(account1);
        let borrowBalance = await iToken0.borrowBalanceStored(account1);
        let expected = borrowAmount
          .mul(price1)
          .add(borrowBalance.mul(price0))
          .sub(
            balance
              .mul(price0)
              .mul(exchangeRate)
              .div(utils.parseEther("1"))
              .mul(8)
              .div(10)
          );
        let equity = await controller.calcAccountEquity(account1);

        // Should be a shortfall
        expect(equity[0]).to.equal(0);
        expect(equity[1]).to.equal(expected);
      });

      it("Should get correct account equity after changing borrow factor", async function () {
        let exchangeRate = await iToken0.exchangeRateStored();
        let price0 = await priceOracle.getUnderlyingPrice(iToken0.address);
        let price1 = await priceOracle.getUnderlyingPrice(iToken1.address);
        let balance0 = await iToken0.balanceOf(account1);
        let borrowBalance0 = await iToken0.borrowBalanceStored(account1);
        let borrowBalance1 = await iToken1.borrowBalanceStored(account1);

        let newBorrowFactor = ethers.utils.parseUnits("0.8", 18);
        await controller._setBorrowFactor(iToken1.address, newBorrowFactor);

        let expected = borrowBalance0
          .mul(price0)
          .add(borrowBalance1.mul(price1).mul(10).div(8))
          .sub(
            balance0
              .mul(price0)
              .mul(exchangeRate)
              .div(utils.parseEther("1"))
              .mul(8)
              .div(10)
          );
        let equity = await controller.calcAccountEquity(account1);

        // Should be a shortfall
        expect(equity[0]).to.equal(0);
        expect(equity[1]).to.equal(expected);
      });

      it("Should get correct account equity after enter new market", async function () {
        let exchangeRate1 = await iToken1.exchangeRateStored();
        let price1 = await priceOracle.getUnderlyingPrice(iToken1.address);
        let balance1 = await iToken1.balanceOf(account2);

        let equity = await controller.calcAccountEquity(account2);
        expect(equity[0]).to.equal(0);

        // User2 use iToken0 and iToken1 as collateral
        await controller.connect(user2).enterMarkets([iToken1.address]);

        // User2 has minted 100 iToken1
        let expected = balance1
          .mul(price1)
          .mul(exchangeRate1)
          .div(utils.parseEther("1"))
          .mul(9)
          .div(10);
        equity = await controller.calcAccountEquity(account2);

        expect(equity[0]).to.equal(expected);
      });

      it("Should get correct account equity after exit market", async function () {
        // User2 remove iToken1 from collateral
        await controller.connect(user2).exitMarkets([iToken1.address]);
        let equity = await controller.calcAccountEquity(account2);

        expect(equity[0]).to.equal(0);
      });

      it("Should fail if the underlying price is unavailable", async function () {
        // Use mock oracle
        await controller._setPriceOracle(mockPriceOracle.address);

        await setOraclePrices(mockPriceOracle, [iToken0, iToken1], [1, 0]);

        await expect(controller.calcAccountEquity(account1)).to.revertedWith(
          "Invalid price to calculate account equity"
        );

        await setOraclePrices(mockPriceOracle, [iToken0, iToken1], [0, 1]);

        await expect(controller.calcAccountEquity(account1)).to.revertedWith(
          "Invalid price to calculate account equity"
        );
      });

      it("Should fail if the underlying price is unavailable in controllerV2 ", async function () {
        // Use controllerV2
        await iToken0._setController(controllerV2.address);
        await iToken1._setController(controllerV2.address);

        // Use mock oracle
        await controllerV2._setPriceOracle(mockPriceOracle.address);
        await setOraclePrices(
          mockPriceOracle,
          [iToken0, iToken1],
          [1, 1],
          [true, true]
        );

        await controllerV2
          .connect(user1)
          .enterMarkets([iToken0.address, iToken1.address]);
        await iToken0.connect(user1).borrow(0);
        await iToken1.connect(user1).borrow(0);

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
            controllerV2.calcAccountEquity(account1)
          ).to.revertedWith("Invalid price to calculate account equity");
        }
      });
    });
  });
});
