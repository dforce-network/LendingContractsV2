// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./AggregatorModel.sol";
import "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";

interface IChainlinkAggregator {
    function latestAnswer() external view returns (int256);

    function latestTimestamp() external view returns (uint256);

    function latestRound() external view returns (uint256);

    function getAnswer(uint256 roundId) external view returns (int256);

    function getTimestamp(uint256 roundId) external view returns (uint256);

    function decimals() external view returns (uint8);
}

contract GOLDxAggregatorModel is AggregatorModel {
    using SignedSafeMathUpgradeable for int256;

    IChainlinkAggregator private assetAggregator;

    int256 private constant BASE = 1 ether;
    int256 private constant unit = 31103476800000000000;

    constructor(IChainlinkAggregator _assetAggregator) public {
        assetAggregator = _assetAggregator;
    }

    /**
     * @notice Reads the current answer from aggregator delegated to.
     * @return The price of the asset aggregator (scaled by decimals), zero under unexpected case.
     */
    function latestAnswer() external view override returns (int256) {
        int256 _assetPrice = assetAggregator.latestAnswer();
        if (_assetPrice > 0)
            return _assetPrice.mul(BASE).div(unit);

        return 0;
    }

    /**
     * @notice represents the number of decimals the aggregator responses represent.
     * @return The decimal point of the aggregator.
     */
    function decimals() external view override returns (uint8) {
        return assetAggregator.decimals();
    }

    /**
     * @dev Used to query the source address of the aggregator.
     * @return Asset aggregator address.
     */
    function getAggregators() external view returns (IChainlinkAggregator) {
        return assetAggregator;
    }
}