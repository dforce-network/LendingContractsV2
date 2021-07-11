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

contract GOLDxAggregatorETHToUsdModel is AggregatorModel {
    using SignedSafeMathUpgradeable for int256;

    int256 private constant BASE = 1 ether;
    int256 private constant unit = 31103476800000000000;

    IChainlinkAggregator private assetAggregator;
    IChainlinkAggregator private transitAggregator;

    constructor(IChainlinkAggregator _assetAggregator, IChainlinkAggregator _transitAggregator) public {
        assetAggregator = _assetAggregator;
        transitAggregator = _transitAggregator;
    }

    /**
     * @notice Reads the current answer from aggregator delegated to.
     * @return The price of the asset aggregator (scaled by decimals), zero under unexpected case.
     */
    function latestAnswer() external view override returns (int256) {
        int256 _assetPrice = assetAggregator.latestAnswer();
        int256 _transitPrice = transitAggregator.latestAnswer();
        int256 _scale = int256(10 ** uint256(transitAggregator.decimals()));
        if (_assetPrice > 0 && _transitPrice > 0 && _scale > 0)
            return _assetPrice.mul(_transitPrice).div(_scale).mul(BASE).div(unit);

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
     *         Transit aggregator address
     */
    function getAggregators() external view returns (IChainlinkAggregator, IChainlinkAggregator) {
        return (assetAggregator, transitAggregator);
    }
}