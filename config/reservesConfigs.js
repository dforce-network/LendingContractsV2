const MAX = ethers.constants.MaxUint256;

module.exports = {
  mainnet: {
    // UNI, DF, GOLDx, BUSD and HBTC
    closeFactor: "0.5",
    liquidationIncentive: "1.20",
    busd: {
      // iToken config
      iTokenName: "dForce BUSD",
      iTokenSymbol: "iBUSD",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "10000000",
      borrowCapacity: "10000000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.03",
    },
    dai: {
      // iToken config
      iTokenName: "dForce DAI",
      iTokenSymbol: "iDAI",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "30000000",
      borrowCapacity: "15000000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.03",
    },
    df: {
      // iToken config
      iTokenName: "dForce DF",
      iTokenSymbol: "iDF",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.4",
      borrowFactor: "1",
      supplyCapacity: "50000000",
      borrowCapacity: "0",
      distributionFactor: "1",
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    eth: {
      // iToken config
      iTokenName: "dForce ETH",
      iTokenSymbol: "iETH",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "40000",
      borrowCapacity: "20000",
      distributionFactor: "1",
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    goldx: {
      // iToken config
      iTokenName: "dForce GOLDx",
      iTokenSymbol: "iGOLDx",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "50000",
      borrowCapacity: "50000",
      distributionFactor: "1",
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    hbtc: {
      // iToken config
      iTokenName: "dForce HBTC",
      iTokenSymbol: "iHBTC",
      reserveRatio: "0.2",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "300",
      borrowCapacity: "300",
      distributionFactor: "1",
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    uni: {
      // iToken config
      iTokenName: "dForce UNI",
      iTokenSymbol: "iUNI",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.7",
      borrowFactor: "1",
      supplyCapacity: "100000",
      borrowCapacity: "100000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    usdc: {
      // iToken config
      iTokenName: "dForce USDC",
      iTokenSymbol: "iUSDC",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "30000000",
      borrowCapacity: "15000000",
      distributionFactor: "1",
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.03",
    },
    usdt: {
      // iToken config
      iTokenName: "dForce USDT",
      iTokenSymbol: "iUSDT",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      // set 0 for collateral, so does not support usdt as collateral.
      collateralFactor: "0",
      borrowFactor: "1",
      supplyCapacity: "30000000",
      borrowCapacity: "15000000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.03",
    },
    usdx: {
      // iToken config
      iTokenName: "dForce USDx",
      iTokenSymbol: "iUSDx",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "20000000",
      borrowCapacity: "10000000",
      distributionFactor: "1",
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.03",
    },
    wbtc: {
      // iToken config
      iTokenName: "dForce WBTC",
      iTokenSymbol: "iWBTC",
      reserveRatio: "0.2",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "1100",
      borrowCapacity: "550",
      distributionFactor: "1",
      // interest model config
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    xusd_msd: {
      // MSD cofig
      msdTokenName: "dForce USD",
      msdTokenSymbol: "USX",
      decimals: 18,
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      borrowRate: 1.03,
      // iToken config
      iTokenName: "dForce USD",
      iTokenSymbol: "iMUSX",
      reserveRatio: "0",
      // controller config
      collateralFactor: "0",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: "100000000",
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.001",
      // MSDS Token config
      name: "dForce xUSD Saving",
      symbol: "xUSDS",
    },
    xusd: {
      // iToken config
      iTokenName: "dForce USD",
      iTokenSymbol: "iUSX",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.7",
      borrowFactor: "1",
      supplyCapacity: "30000000",
      borrowCapacity: "30000000",
      distributionFactor: "1",
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.001",
    },
    xusd_sp: {
      // iToken config
      iTokenName: "dForce USD",
      iTokenSymbol: "iUSX",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "100000000",
      borrowCapacity: "0",
      distributionFactor: "1",
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.001",
    },
    xeur_msd: {
      // MSD cofig
      msdTokenName: "dForce EUR",
      msdTokenSymbol: "EUX",
      decimals: 18,
      // iToken config
      iTokenName: "dForce EUR",
      iTokenSymbol: "iMEUX",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      borrowRate: 1.03,
      // controller config
      collateralFactor: "0",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: "20000000",
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.001",
      // MSDS Token config
      name: "dForce xEUR Saving",
      symbol: "xEURS",
    },
    xeur: {
      // iToken config
      iTokenName: "dForce EUR",
      iTokenSymbol: "iEUX",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.7",
      borrowFactor: "1",
      supplyCapacity: "20000000",
      borrowCapacity: "20000000",
      distributionFactor: "1",
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.001",
    },
    xeur_sp: {
      // iToken config
      iTokenName: "dForce EUR",
      iTokenSymbol: "iEUX",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "40000000",
      borrowCapacity: "0",
      distributionFactor: "1",
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.001",
    },
    xbtc_gp: {
      // MSD cofig
      msdTokenName: "dForce BTC",
      msdTokenSymbol: "xBTC",
      decimals: 18,
      // iToken config
      iTokenName: "dForce BTC",
      iTokenSymbol: "iMxBTC",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      borrowRate: 0,
      // controller config
      collateralFactor: "0",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: "400",
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    xbtc: {
      // iToken config
      iTokenName: "dForce BTC",
      iTokenSymbol: "ixBTC",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.7",
      borrowFactor: "1",
      supplyCapacity: "400",
      borrowCapacity: "400",
      distributionFactor: "1",
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    // General Pool
    xeth_gp: {
      // MSD cofig
      msdTokenName: "dForce ETH",
      msdTokenSymbol: "xETH",
      decimals: 18,
      // iToken config
      iTokenName: "dForce ETH",
      iTokenSymbol: "iMxETH",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      borrowRate: 0,
      // controller config
      collateralFactor: "0",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: "5000",
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    xeth: {
      // iToken config
      iTokenName: "dForce ETH",
      iTokenSymbol: "ixETH",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.7",
      borrowFactor: "1",
      supplyCapacity: "5000",
      borrowCapacity: "5000",
      distributionFactor: "1",
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    xtsla_msd: {
      // MSD cofig
      msdTokenName: "dForce Tesla Stock",
      msdTokenSymbol: "xTSLA",
      decimals: 18,
      // iToken config
      iTokenName: "dForce TSLA",
      iTokenSymbol: "iMxTSLA",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      borrowRate: 0,
      // controller config
      collateralFactor: "0",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: MAX,
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.1",
      // MSDS Token config
      name: "dForce xTSLA Saving",
      symbol: "xTSLAS",
    },
    xaapl_msd: {
      // MSD cofig
      msdTokenName: "dForce Apple Stock",
      msdTokenSymbol: "xAAPL",
      decimals: 18,
      // iToken config
      iTokenName: "dForce APPL",
      iTokenSymbol: "iMxAAPL",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      borrowRate: 0,
      // controller config
      collateralFactor: "0",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: MAX,
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.1",
      // MSDS Token config
      name: "dForce xAAPL Saving",
      symbol: "xAPPLS",
    },
    amazon_msd: {
      // MSD cofig
      msdTokenName: "dForce Amazon Stock",
      msdTokenSymbol: "xAMZN",
      decimals: 18,
      // iToken config
      iTokenName: "dForce AMZN",
      iTokenSymbol: "iMxAMZN",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      borrowRate: 0,
      // controller config
      collateralFactor: "0",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: MAX,
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    coinbase_msd: {
      // MSD cofig
      msdTokenName: "dForce Coinbase Stock",
      msdTokenSymbol: "xCOIN",
      decimals: 18,
      // iToken config
      iTokenName: "dForce COIN",
      iTokenSymbol: "iMxCOIN",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      borrowRate: 0,
      // controller config
      collateralFactor: "0",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: MAX,
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },

  },
  kovan: {
    closeFactor: "0.5",
    liquidationIncentive: "1.2",
    busd: {
      // iToken config
      iTokenName: "dForce BUSD",
      iTokenSymbol: "iBUSD",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "20000000",
      borrowCapacity: "20000000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.03",
    },
    wbtc: {
      // iToken config
      iTokenName: "dForce WBTC",
      iTokenSymbol: "iWBTC",
      reserveRatio: "0.2",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "1100",
      borrowCapacity: "550",
      distributionFactor: "1",
      // interest model config
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    hbtc: {
      // iToken config
      iTokenName: "dForce HBTC",
      iTokenSymbol: "iHBTC",
      reserveRatio: "0.2",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "1100",
      borrowCapacity: "550",
      distributionFactor: "1",
      // interest model config
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    goldx: {
      // iToken config
      iTokenName: "dForce GOLDx",
      iTokenSymbol: "iGOLDx",
      reserveRatio: "0.15",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "50000",
      borrowCapacity: "50000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    uni: {
      // iToken config
      iTokenName: "dForce UNI",
      iTokenSymbol: "iUNI",
      reserveRatio: "0.15",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.7",
      borrowFactor: "1",
      supplyCapacity: "300000",
      borrowCapacity: "300000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    df: {
      // iToken config
      iTokenName: "dForce DF",
      iTokenSymbol: "iDF",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.4",
      borrowFactor: "1",
      supplyCapacity: "150000000",
      borrowCapacity: "0",
      distributionFactor: "1",
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    eth: {
      // iToken config
      iTokenName: "dForce ETH",
      iTokenSymbol: "iETH",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "40000",
      borrowCapacity: "20000",
      distributionFactor: "1",
      // interest model config
      baseInterest: "0",
      interest: "0.08",
      highInterest: "1",
      high: "0.75",
      // when the first time to deploy interest model for eth,
      // just do not set the following parameter `interestModelType`
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    usdt: {
      // iToken config
      iTokenName: "dForce USDT",
      iTokenSymbol: "iUSDT",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      // set 0 for collateral, so does not support usdt as collateral.
      collateralFactor: "0",
      borrowFactor: "1",
      supplyCapacity: "30000000",
      borrowCapacity: "15000000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.03",
    },
    usdc: {
      // iToken config
      iTokenName: "dForce USDC",
      iTokenSymbol: "iUSDC",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "30000000",
      borrowCapacity: "15000000",
      distributionFactor: "1",
      // interest model config
      baseInterest: "0",
      interest: "0.08",
      highInterest: "1",
      high: "0.75",
      // when the first time to deploy interest model for usdc,
      // just do not set the following parameter `interestModelType`
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.03",
    },
    dai: {
      // iToken config
      iTokenName: "dForce DAI",
      iTokenSymbol: "iDAI",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "30000000",
      borrowCapacity: "15000000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.03",
    },
    usdx: {
      // iToken config
      iTokenName: "dForce USDx",
      iTokenSymbol: "iUSDx",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "20000000",
      borrowCapacity: "10000000",
      distributionFactor: "1",
      // interest model config
      baseInterest: "0",
      interest: "0.08",
      highInterest: "1",
      high: "0.75",
      // when the first time to deploy interest model for usdc,
      // just do not set the following parameter `interestModelType`
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.03",
    },
    xusd_msd: {
      // MSD cofig
      msdTokenName: "dForce USD",
      msdTokenSymbol: "USX",
      decimals: 18,
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      borrowRate: "0",
      // iToken config
      iTokenName: "dForce USD",
      iTokenSymbol: "USX",
      reserveRatio: "0",
      // controller config
      collateralFactor: "0.9",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: MAX,
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.001",
      // MSDS Token config
      name: "dForce xUSD Saving",
      symbol: "xUSDS",
    },
    xusd: {
      // iToken config
      iTokenName: "USX",
      iTokenSymbol: "iUSX",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "80000000",
      borrowCapacity: "80000000",
      distributionFactor: "1",
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.001",
    },
    xcny_msd: {
      // MSD cofig
      msdTokenName: "dForce CNX",
      msdTokenSymbol: "CNX",
      decimals: 18,
      // iToken config
      iTokenName: "dForce iMCNX",
      iTokenSymbol: "iMCNX",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      borrowRate: "0.02",
      // controller config
      collateralFactor: "0.9",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: "500000",
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.001",
      // MSDS Token config
      name: "dForce xCNY Saving",
      symbol: "xCNYS",
    },
    xcny: {
      // iToken config
      iTokenName: "dForce CNX",
      iTokenSymbol: "iCNX",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.9",
      borrowFactor: "1",
      supplyCapacity: "10000000",
      borrowCapacity: "10000000",
      distributionFactor: "1",
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.001",
    },
    xeur_msd: {
      // MSD cofig
      msdTokenName: "dForce EUR",
      msdTokenSymbol: "EUX",
      decimals: 18,
      // iToken config
      iTokenName: "dForce EUR",
      iTokenSymbol: "EUX",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      borrowRate: "0",
      // controller config
      collateralFactor: "0.9",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: MAX,
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.001",
      // MSDS Token config
      name: "dForce xEUR Saving",
      symbol: "xEURS",
    },
    xeur: {
      // iToken config
      iTokenName: "EUX",
      iTokenSymbol: "iEUX",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "80000000",
      borrowCapacity: "80000000",
      distributionFactor: "1",
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.001",
    },
    xtsla_msd: {
      // MSD cofig
      msdTokenName: "dForce Tesla Stock",
      msdTokenSymbol: "xTSLA",
      decimals: 18,
      // iToken config
      iTokenName: "dForce Tesla Stock",
      iTokenSymbol: "xTSLA",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      borrowRate: "0",
      // controller config
      collateralFactor: "0.9",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: MAX,
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.1",
      // MSDS Token config
      name: "dForce xTSLA Saving",
      symbol: "xTSLAS",
    },
    xtsla: {
      // iToken config
      iTokenName: "dForce xTSLA",
      iTokenSymbol: "ixTSLA",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.9",
      borrowFactor: "1",
      supplyCapacity: "10000000",
      borrowCapacity: "10000000",
      distributionFactor: "1",
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    // xtsla: {
    //   // iToken config
    //   iTokenName: "dForce xTSLA",
    //   iTokenSymbol: "ixTSLA",
    //   reserveRatio: "0.1",
    //   flashloanFeeRatio: "0.0004",
    //   protocolFeeRatio: "0.3",
    //   // controller config
    //   collateralFactor: "0.9",
    //   borrowFactor: "1",
    //   supplyCapacity: "10000000",
    //   borrowCapacity: "10000000",
    //   distributionFactor: "1",
    //   interestModelType: "nonStableInterestModel",
    //   // asset price swing
    //   priceSwing: "0.1",
    // },
    xaapl_msd: {
      // MSD cofig
      msdTokenName: "dForce Apple Stock",
      msdTokenSymbol: "xAAPL",
      decimals: 18,
      // iToken config
      iTokenName: "dForce Apple Stock",
      iTokenSymbol: "xAAPL",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      borrowRate: "0",
      // controller config
      collateralFactor: "0.9",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: MAX,
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.1",
      // MSDS Token config
      name: "dForce xAAPL Saving",
      symbol: "xAPPLS",
    },
    xappl: {
      // iToken config
      iTokenName: "dForce xAAPL",
      iTokenSymbol: "ixAPPL",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.9",
      borrowFactor: "1",
      supplyCapacity: "10000000",
      borrowCapacity: "10000000",
      distributionFactor: "1",
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    // General Pool
    xbtc_gp: {
      // MSD cofig
      msdTokenName: "dForce BTC",
      msdTokenSymbol: "xBTC",
      decimals: 18,
      // iToken config
      iTokenName: "dForce BTC",
      iTokenSymbol: "xBTC",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      borrowRate: "0",
      // controller config
      collateralFactor: "0.9",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: MAX,
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    xbtc: {
      // iToken config
      iTokenName: "xBTC",
      iTokenSymbol: "ixBTC",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.75",
      borrowFactor: "1",
      supplyCapacity: "1000",
      borrowCapacity: "1000",
      distributionFactor: "1",
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    // General Pool
    xeth_gp: {
      // MSD cofig
      msdTokenName: "dForce ETH",
      msdTokenSymbol: "xETH",
      decimals: 18,
      // iToken config
      iTokenName: "dForce ETH",
      iTokenSymbol: "xETH",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      borrowRate: "0",
      // controller config
      collateralFactor: "0.9",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: MAX,
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    xeth: {
      // iToken config
      iTokenName: "xETH",
      iTokenSymbol: "ixETH",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.75",
      borrowFactor: "1",
      supplyCapacity: "30000",
      borrowCapacity: "30000",
      distributionFactor: "1",
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    amazon_msd: {
      // MSD cofig
      msdTokenName: "dForce Amazon Stock",
      msdTokenSymbol: "xAMZN",
      decimals: 18,
      // iToken config
      iTokenName: "dForce Amazon Stock",
      iTokenSymbol: "xAMZN",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      borrowRate: "0",
      // controller config
      collateralFactor: "0.9",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: MAX,
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    amazon: {
      // iToken config
      iTokenName: "dForce Amazon Stock",
      iTokenSymbol: "ixAMZN",
      reserveRatio: "0.15",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.75",
      borrowFactor: "1",
      supplyCapacity: "30000",
      borrowCapacity: "30000",
      distributionFactor: "1",
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    coinbase_msd: {
      // MSD cofig
      msdTokenName: "dForce Coinbase Stock",
      msdTokenSymbol: "xCOIN",
      decimals: 18,
      // iToken config
      iTokenName: "dForce Coinbase Stock",
      iTokenSymbol: "xCOIN",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      borrowRate: "0",
      // controller config
      collateralFactor: "0.9",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: MAX,
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    coinbase: {
      // iToken config
      iTokenName: "dForce Amazon Stock",
      iTokenSymbol: "ixCOIN",
      reserveRatio: "0.15",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.75",
      borrowFactor: "1",
      supplyCapacity: "30000",
      borrowCapacity: "30000",
      distributionFactor: "1",
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    xgzmt_msd: {
      // MSD cofig
      msdTokenName: "dForce GZMTX",
      msdTokenSymbol: "GZMTX",
      decimals: 18,
      // iToken config
      iTokenName: "dForce iMGZMTX",
      iTokenSymbol: "iMGZMTX",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      borrowRate: "0.05",
      // controller config
      collateralFactor: "0.9",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: "10000000",
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.1",
      // MSDS Token config
      name: "dForce xGZMT Saving",
      symbol: "xGZMTS",
    },
    xgzmt: {
      // iToken config
      iTokenName: "dForce xGZMT",
      iTokenSymbol: "ixGZMT",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.9",
      borrowFactor: "1",
      supplyCapacity: "10000000",
      borrowCapacity: "10000000",
      distributionFactor: "1",
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    iuni_v2_xbtc_wbtc: {
      // iToken config
      iTokenName: "dForce Uniswap V2 xBTC-WBTC",
      iTokenSymbol: "iUNI_V2_xBTC_WBTC",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.6",
      borrowFactor: "1",
      supplyCapacity: "1000",
      borrowCapacity: "0",
      distributionFactor: "1",
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    iuni_v2_xeth_eth: {
      // iToken config
      iTokenName: "dForce Uniswap V2 xETH-WETH",
      iTokenSymbol: "iUNI_V2_xETH_ETH",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.6",
      borrowFactor: "1",
      supplyCapacity: "30000",
      borrowCapacity: "0",
      distributionFactor: "1",
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    iuni_v2_usx_usdt: {
      // iToken config
      iTokenName: "dForce Uniswap V2 USX-USDT",
      iTokenSymbol: "iUNI_V2_USX_USDT",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.7",
      borrowFactor: "1",
      supplyCapacity: "80000000",
      borrowCapacity: "0",
      distributionFactor: "1",
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    iuni_v2_usx_eux: {
      // iToken config
      iTokenName: "dForce Uniswap V2 USX-EUX",
      iTokenSymbol: "iUNI_V2_USX_EUX",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.7",
      borrowFactor: "1",
      supplyCapacity: "80000000",
      borrowCapacity: "0",
      distributionFactor: "1",
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    }
  },
  bsc: {
    closeFactor: "0.5",
    liquidationIncentive: "1.1",
    ada: {
      // iToken config
      iTokenName: "dForce ADA",
      iTokenSymbol: "iADA",
      reserveRatio: "0.15",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.7",
      borrowFactor: "1",
      supplyCapacity: "8000000",
      borrowCapacity: "8000000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    atom: {
      // iToken config
      iTokenName: "dForce ATOM",
      iTokenSymbol: "iATOM",
      reserveRatio: "0.15",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.7",
      borrowFactor: "1",
      supplyCapacity: "750000",
      borrowCapacity: "750000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    btcb: {
      // iToken config
      iTokenName: "dForce BTC",
      iTokenSymbol: "iBTC",
      reserveRatio: "0.15",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "800",
      borrowCapacity: "800",
      distributionFactor: "1",
      // interest model config
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    busd: {
      // iToken config
      iTokenName: "dForce BUSD",
      iTokenSymbol: "iBUSD",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "20000000",
      borrowCapacity: "20000000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.03",
    },
    dai: {
      // iToken config
      iTokenName: "dForce DAI",
      iTokenSymbol: "iDAI",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "20000000",
      borrowCapacity: "20000000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.03",
    },
    df: {
      // iToken config
      iTokenName: "dForce Token",
      iTokenSymbol: "iDF",
      reserveRatio: "0.15",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.4",
      borrowFactor: "1",
      supplyCapacity: "50000000",
      borrowCapacity: "0",
      distributionFactor: "1",
      // interest model config
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    dot: {
      // iToken config
      iTokenName: "dForce DOT",
      iTokenSymbol: "iDOT",
      reserveRatio: "0.15",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.7",
      borrowFactor: "1",
      supplyCapacity: "400000",
      borrowCapacity: "400000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    // BNB
    eth: {
      // iToken config
      iTokenName: "dForce BNB",
      iTokenSymbol: "iBNB",
      reserveRatio: "0.15",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.75",
      borrowFactor: "1",
      supplyCapacity: "180000",
      borrowCapacity: "180000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    eth_token: {
      // iToken config
      iTokenName: "dForce ETH",
      iTokenSymbol: "iETH",
      reserveRatio: "0.15",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "20000",
      borrowCapacity: "20000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    fil: {
      // iToken config
      iTokenName: "dForce FIL",
      iTokenSymbol: "iFIL",
      reserveRatio: "0.15",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.7",
      borrowFactor: "1",
      supplyCapacity: "350000",
      borrowCapacity: "350000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    goldx: {
      // iToken config
      iTokenName: "dForce GOLDx",
      iTokenSymbol: "iGOLDx",
      reserveRatio: "0.15",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "50000",
      borrowCapacity: "50000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    uni: {
      // iToken config
      iTokenName: "dForce UNI",
      iTokenSymbol: "iUNI",
      reserveRatio: "0.15",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.7",
      borrowFactor: "1",
      supplyCapacity: "300000",
      borrowCapacity: "300000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    usdc: {
      // iToken config
      iTokenName: "dForce USDC",
      iTokenSymbol: "iUSDC",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "20000000",
      borrowCapacity: "20000000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.03",
    },
    usdt: {
      // iToken config
      iTokenName: "dForce USDT",
      iTokenSymbol: "iUSDT",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "20000000",
      borrowCapacity: "20000000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.03",
    },
    xusd_msd: {
      // MSD cofig
      msdTokenName: "dForce USD",
      msdTokenSymbol: "USX",
      decimals: 18,
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      borrowRate: 1.03,
      // iToken config
      iTokenName: "dForce USD",
      iTokenSymbol: "iMUSX",
      reserveRatio: "0",
      // controller config
      collateralFactor: "0",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: "100000000",
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.001",
      // MSDS Token config
      name: "dForce xUSD Saving",
      symbol: "xUSDS",
    },
    xusd: {
      // iToken config
      iTokenName: "dForce USD",
      iTokenSymbol: "iUSX",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.7",
      borrowFactor: "1",
      supplyCapacity: "30000000",
      borrowCapacity: "30000000",
      distributionFactor: "1",
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.001",
    },
    xusd_sp: {
      // iToken config
      iTokenName: "dForce USD",
      iTokenSymbol: "iUSX",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "100000000",
      borrowCapacity: "0",
      distributionFactor: "1",
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.001",
    },
    xeur_msd: {
      // MSD cofig
      msdTokenName: "dForce EUR",
      msdTokenSymbol: "EUX",
      decimals: 18,
      // iToken config
      iTokenName: "dForce EUR",
      iTokenSymbol: "iMEUX",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      borrowRate: 1.03,
      // controller config
      collateralFactor: "0",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: "20000000",
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.001",
      // MSDS Token config
      name: "dForce xEUR Saving",
      symbol: "xEURS",
    },
    xeur: {
      // iToken config
      iTokenName: "dForce EUR",
      iTokenSymbol: "iEUX",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.7",
      borrowFactor: "1",
      supplyCapacity: "20000000",
      borrowCapacity: "20000000",
      distributionFactor: "1",
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.001",
    },
    xeur_sp: {
      // iToken config
      iTokenName: "dForce EUR",
      iTokenSymbol: "iEUX",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "40000000",
      borrowCapacity: "0",
      distributionFactor: "1",
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.001",
    },
    xbtc_gp: {
      // MSD cofig
      msdTokenName: "dForce BTC",
      msdTokenSymbol: "xBTC",
      decimals: 18,
      // iToken config
      iTokenName: "dForce BTC",
      iTokenSymbol: "iMxBTC",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      borrowRate: 0,
      // controller config
      collateralFactor: "0",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: "400",
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    xbtc: {
      // iToken config
      iTokenName: "dForce BTC",
      iTokenSymbol: "ixBTC",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.7",
      borrowFactor: "1",
      supplyCapacity: "400",
      borrowCapacity: "400",
      distributionFactor: "1",
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    // General Pool
    xeth_gp: {
      // MSD cofig
      msdTokenName: "dForce ETH",
      msdTokenSymbol: "xETH",
      decimals: 18,
      // iToken config
      iTokenName: "dForce ETH",
      iTokenSymbol: "iMxETH",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      borrowRate: 0,
      // controller config
      collateralFactor: "0",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: "5000",
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    xeth: {
      // iToken config
      iTokenName: "dForce ETH",
      iTokenSymbol: "ixETH",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.7",
      borrowFactor: "1",
      supplyCapacity: "5000",
      borrowCapacity: "5000",
      distributionFactor: "1",
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    xtsla_msd: {
      // MSD cofig
      msdTokenName: "dForce Tesla Stock",
      msdTokenSymbol: "xTSLA",
      decimals: 18,
      // iToken config
      iTokenName: "dForce TSLA",
      iTokenSymbol: "iMxTSLA",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      borrowRate: 0,
      // controller config
      collateralFactor: "0",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: MAX,
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.1",
      // MSDS Token config
      name: "dForce xTSLA Saving",
      symbol: "xTSLAS",
    },
    xaapl_msd: {
      // MSD cofig
      msdTokenName: "dForce Apple Stock",
      msdTokenSymbol: "xAAPL",
      decimals: 18,
      // iToken config
      iTokenName: "dForce APPL",
      iTokenSymbol: "iMxAAPL",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      borrowRate: 0,
      // controller config
      collateralFactor: "0",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: MAX,
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.1",
      // MSDS Token config
      name: "dForce xAAPL Saving",
      symbol: "xAPPLS",
    },
    amazon_msd: {
      // MSD cofig
      msdTokenName: "dForce Amazon Stock",
      msdTokenSymbol: "xAMZN",
      decimals: 18,
      // iToken config
      iTokenName: "dForce AMZN",
      iTokenSymbol: "iMxAMZN",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      borrowRate: 0,
      // controller config
      collateralFactor: "0",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: MAX,
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    coinbase_msd: {
      // MSD cofig
      msdTokenName: "dForce Coinbase Stock",
      msdTokenSymbol: "xCOIN",
      decimals: 18,
      // iToken config
      iTokenName: "dForce COIN",
      iTokenSymbol: "iMxCOIN",
      reserveRatio: "0",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      borrowRate: 0,
      // controller config
      collateralFactor: "0",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: MAX,
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
  },
  bsc_test: {
    closeFactor: "0.5",
    liquidationIncentive: "1.1",
    ada: {
      // iToken config
      iTokenName: "dForce ADA",
      iTokenSymbol: "iADA",
      reserveRatio: "0.15",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.7",
      borrowFactor: "1",
      supplyCapacity: "8000000",
      borrowCapacity: "8000000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    atom: {
      // iToken config
      iTokenName: "dForce ATOM",
      iTokenSymbol: "iATOM",
      reserveRatio: "0.15",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.7",
      borrowFactor: "1",
      supplyCapacity: "750000",
      borrowCapacity: "750000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    btcb: {
      // iToken config
      iTokenName: "dForce BTC",
      iTokenSymbol: "iBTC",
      reserveRatio: "0.15",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "800",
      borrowCapacity: "800",
      distributionFactor: "1",
      // interest model config
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    busd: {
      // iToken config
      iTokenName: "dForce BUSD",
      iTokenSymbol: "iBUSD",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "20000000",
      borrowCapacity: "20000000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.03",
    },
    dai: {
      // iToken config
      iTokenName: "dForce DAI",
      iTokenSymbol: "iDAI",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "20000000",
      borrowCapacity: "20000000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.03",
    },
    df: {
      // iToken config
      iTokenName: "dForce Token",
      iTokenSymbol: "iDF",
      reserveRatio: "0.15",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.4",
      borrowFactor: "1",
      supplyCapacity: "50000000",
      borrowCapacity: "0",
      distributionFactor: "1",
      // interest model config
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    dot: {
      // iToken config
      iTokenName: "dForce DOT",
      iTokenSymbol: "iDOT",
      reserveRatio: "0.15",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.7",
      borrowFactor: "1",
      supplyCapacity: "400000",
      borrowCapacity: "400000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    // BNB
    eth: {
      // iToken config
      iTokenName: "dForce BNB",
      iTokenSymbol: "iBNB",
      reserveRatio: "0.15",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.75",
      borrowFactor: "1",
      supplyCapacity: "180000",
      borrowCapacity: "180000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    eth_token: {
      // iToken config
      iTokenName: "dForce ETH",
      iTokenSymbol: "iETH",
      reserveRatio: "0.15",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "20000",
      borrowCapacity: "20000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    fil: {
      // iToken config
      iTokenName: "dForce FIL",
      iTokenSymbol: "iFIL",
      reserveRatio: "0.15",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.7",
      borrowFactor: "1",
      supplyCapacity: "350000",
      borrowCapacity: "350000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    goldx: {
      // iToken config
      iTokenName: "dForce GOLDx",
      iTokenSymbol: "iGOLDx",
      reserveRatio: "0.15",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "50000",
      borrowCapacity: "50000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    uni: {
      // iToken config
      iTokenName: "dForce UNI",
      iTokenSymbol: "iUNI",
      reserveRatio: "0.15",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.7",
      borrowFactor: "1",
      supplyCapacity: "300000",
      borrowCapacity: "300000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "nonStableInterestModel",
      // asset price swing
      priceSwing: "0.1",
    },
    usdc: {
      // iToken config
      iTokenName: "dForce USDC",
      iTokenSymbol: "iUSDC",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "20000000",
      borrowCapacity: "20000000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.03",
    },
    usdt: {
      // iToken config
      iTokenName: "dForce USDT",
      iTokenSymbol: "iUSDT",
      reserveRatio: "0.1",
      flashloanFeeRatio: "0.0004",
      protocolFeeRatio: "0.3",
      // controller config
      collateralFactor: "0.8",
      borrowFactor: "1",
      supplyCapacity: "20000000",
      borrowCapacity: "20000000",
      distributionFactor: "1",
      // interest model config
      interestModelType: "stableInterestModel",
      // asset price swing
      priceSwing: "0.03",
    },
    xusd: {
      // MSD cofig
      msdTokenName: "dForce USD",
      msdTokenSymbol: "xUSD",
      decimals: 18,
      // iToken config
      iTokenName: "dForce xUSD",
      iTokenSymbol: "ixUSD",
      reserveRatio: "0",
      borrowRate: "0.05",
      // controller config
      collateralFactor: "0.9",
      borrowFactor: "1",
      supplyCapacity: "0",
      borrowCapacity: "10000000",
      distributionFactor: "1",
      interestModelType: "fixedInterestModel",
      // asset price swing
      priceSwing: "0.001",
      // MSDS Token config
      name: "dForce xUSD Saving",
      symbol: "xUSDS",
      supplyRate: "0.03",
    },
  },
};
