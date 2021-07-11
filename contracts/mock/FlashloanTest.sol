//SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import "../interface/IControllerInterface.sol";
import "../interface/IiToken.sol";

// import "hardhat/console.sol";

interface ILendingData {
    function getLiquidationInfo(
        address _borrower,
        address _liquidator,
        address _assetBorrowed,
        address _assetCollateral
    )
        external
        returns (
            uint256,
            uint256,
            uint256
        );

    function controller() external view returns (address);
}

interface IAsset {
    function underlying() external view returns (address);
}

contract FlashloanTest {
    // uint256 public shortfall;
    uint256 public exchangeRate;

    receive() external payable {}

    function executeOperation(
        address _reserve,
        uint256 _amount,
        uint256 _fee,
        bytes memory _data
    ) external payable {
        // console.log(IiToken(msg.sender).exchangeRateCurrent());
        exchangeRate = IiToken(msg.sender).exchangeRateCurrent();
        if (_data.length > 0) {
            (
                address _lendingData,
                address _borrower,
                address _assetBorrowed,
                address _assetCollateral
            ) = decode(_data);
            // (, shortfall, ,) = IControllerInterface(ILendingData(_lendingData).controller()).calcAccountEquity(_borrower);
            // exchangeRate = IiToken(_assetCollateral).exchangeRateStored();
            // (uint256 _maxRepay, uint256 _actualRepay ,uint256 _liquidatorBalance) = ILendingData(_lendingData).getLiquidationInfo(_borrower, address(this), _assetBorrowed, _assetCollateral);
            (, uint256 _actualRepay, ) =
                ILendingData(_lendingData).getLiquidationInfo(
                    _borrower,
                    address(this),
                    _assetBorrowed,
                    _assetCollateral
                );

            if (_actualRepay > 0) {
                IERC20Upgradeable(IAsset(_assetBorrowed).underlying()).approve(
                    _assetBorrowed,
                    _actualRepay
                );
                IiToken(_assetBorrowed).liquidateBorrow(
                    _borrower,
                    _actualRepay,
                    _assetCollateral
                );
            }
        }

        if (_reserve == address(0)) {
            (bool _success, ) = msg.sender.call{ value: _amount + _fee }("");
            require(_success, "Contract execution Failed");
        } else {
            IERC20Upgradeable _token = IERC20Upgradeable(_reserve);
            require(
                _token.balanceOf(address(this)) >= _amount,
                "executeOperation: Flashloan do not get enough cash!"
            );

            //
            // Execute actions by your own strategy at here.
            //

            _token.transfer(msg.sender, _amount + _fee);
        }
    }

    function decode(bytes memory _data)
        public
        pure
        returns (
            address x,
            address y,
            address z,
            address v
        )
    {
        _data;
        assembly {
            x := mload(0x94)
            y := mload(0xa8)
            z := mload(0xbc)
            v := mload(0xd0)
        }
    }
}
