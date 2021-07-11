// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./ExchangeRateModel.sol";
import "../library/SafeRatioMath.sol";

interface IGOLDx {
    function unit() external view returns (uint256);
}

contract GOLDxExchangeRateModel is ExchangeRateModel {
    using SafeRatioMath for uint256;

    IGOLDx private asset;

    uint256 private constant BASE = 1 ether;

    constructor(IGOLDx _asset) public {
        asset = _asset;
    }

    /**
     * @notice scale between token and wrapped token.
     * @dev Get conversion scale.
     * @return scale.
     */
    function scale() external view override returns (uint256) {
        return BASE;
    }

    /**
     * @dev Get token address.
     * @return token address.
     */
    function token() external view override returns (address) {
        return address(asset);
    }

    /**
     * @dev Get exchange rate between token and wrapped token.
     * @return exchange rate.
     */
    function getExchangeRate() external view override returns (uint256) {
        return BASE.rdiv(asset.unit());
    }

    /**
     * @notice The exchange rate between GOLDx and paxg is constant,
     *          so the exchange rate fluctuation between them is a fixed value.
     * @dev Get max swing.
     * @param _interval Interval time in seconds.
     * @return max swing.
     */
    function getMaxSwingRate(uint256 _interval) external view override returns (uint256) {
        _interval;
        return BASE;
    }

    /**
     * @notice GOLDx is a token with no interest rate, so the interest rate is 0.
     * @dev Get the interest rate for a fixed interval time.
     * @param _interval Interval time in seconds.
     * @return interest rate.
     */
    function getFixedInterestRate(uint256 _interval) external view override returns (uint256) {
        _interval;
        return 0;
    }

    /**
     * @notice The exchange rate between GOLDx and paxg is constant,
     *          the parameter _interval is ignored.
     * @dev Get the exchange rate for a fixed interval time.
     * @param _interval Interval time in seconds.
     * @return exchange rate.
     */
    function getFixedExchangeRate(uint256 _interval) external view override returns (uint256) {
        _interval;
        return BASE.rdiv(asset.unit());
    }
}