//SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";

import "./library/Ownable.sol";

/**
 * @title dForce's lending StatusOracle Contract
 * @author dForce
 */
contract StatusOracle is Ownable {
    using SafeMathUpgradeable for uint256;
    
    /// @dev Set the address of the pause time.
    address public pauser;
    
    /// @dev Time zone (in seconds).
    int256 internal timeZone;
    
    /// @dev Market opening time, example: 9:00 is 9 * 3600 (in seconds).
    uint256 internal marketOpeningTime;
    
    /// @dev Duration, starting from market opening time (in seconds).
    uint256 internal duration;
    
    /// @dev Unusual opening and closing information
    struct Status {

        // Whether to activate the unusual status, true: activated; false: Not activated.
        bool activated;

        // Unusual market opening time.
        uint256 marketOpeningTime;

        // Unusual market closing time.
        uint256 marketclosingTime;
    }
    /// @dev An unusual status on a certain day, key: timestamp / 1 days;
    mapping(uint256 => Status) internal date;
    
    /// @dev Pause the timestamp, only the current day (according to the time zone).
    uint256 internal pauseTime;
    
    /// @dev Asset suspension timestamp, used to suspend specific assets only on the current day (according to the time zone).
    mapping(address => uint256) internal assetPauseTime;


    /// @dev Emitted when `pauser` is changed.
    event SetPauser(address oldPauser, address newPauser);
    
    /// @dev Emitted when `timeZone` is changed.
    event SetTimeZone(int256 oldTimeZone, int256 newTimeZone);
    
    /// @dev Emitted when `marketOpeningTime` is changed.
    event SetMarketOpeningTime(uint256 oldMarketOpeningTime, uint256 newMarketOpeningTime);
    
    /// @dev Emitted when `duration` is changed.
    event SetDuration(uint256 oldDuration, uint256 newDuration);

    /// @dev Emitted when `date` is set.
    event SetDate(uint256 timestamp, uint256 timeKey, uint256 marketOpeningTime, uint256 marketclosingTime, bool activated);
    
    /// @dev Emitted when `pauseTime` is changed.
    event SetPauseTime(uint256 oldPauseTime, uint256 newPauseTime);

    /// @dev Emitted when `assetPauseTime` is changed.
    event SetAssetPauseTime(address asset, uint256 oldPauseTime, uint256 newPauseTime);


    /**
     * @dev The constructor sets some data and initializes the owner
     * @param _pauser New pauser.
     * @param _timeZone Time zone.
     * @param _marketOpeningTime The market is open every day.
     * @param _duration Market duration.
     */
    constructor(
        address _pauser,
        int256 _timeZone,
        uint256 _marketOpeningTime,
        uint256 _duration
    ) public {
        __Ownable_init();
        _setPauser(_pauser);
        _setTimeZone(_timeZone);
        _setMarketOpeningTime(_marketOpeningTime);
        _setDuration(_duration);
    }

    /**
     * @dev Throws if called by any account other than owner or pauser.
     */
    modifier pauserAndOwner() {
        require(pauser == msg.sender || owner == msg.sender, "pauserAndOwner: caller is not owner or pauser!");
        _;
    }

    /**
     * @dev Check if the time is valid.
     */
    modifier isValidTime(uint256 _time) {
        require(_time < 24 hours, "isValidTime: Not a valid time!");
        _;
    }

    /**
     * @notice Set new pauser.
     * @dev Owner function to change of pauser.
     * @param _pauser New pauser.
     */
    function _setPauser(address _pauser) public onlyOwner {

        // Gets current pauser.
        address _oldPauser = pauser;

        require(
            _pauser != address(0) && _pauser != _oldPauser,
            "_setPauser: New pauser can not be zero address or pauser has been set!"
        );

        // Sets new pauser.
        pauser = _pauser;

        emit SetPauser(_oldPauser, _pauser);
    }

    /**
     * @notice Set new timeZone.
     * @dev Owner function to change of timeZone.
     * @param _timeZone New timeZone.
     */
    function _setTimeZone(int256 _timeZone) public onlyOwner {

        // Gets current timeZone.
        int256 _oldTimeZone = timeZone;

        require(
            _timeZone >= -11 hours && _timeZone <= 11 hours && _timeZone != _oldTimeZone,
            "_setTimeZone: New timeZone Exceeding the setting range or timeZone has been set!"
        );

        // Sets new timeZone.
        timeZone = _timeZone;

        emit SetTimeZone(_oldTimeZone, _timeZone);
    }

    /**
     * @notice Set new marketOpeningTime.
     * @dev Owner function to change of marketOpeningTime.
     * @param _marketOpeningTime New marketOpeningTime.
     */
    function _setMarketOpeningTime(uint256 _marketOpeningTime) public onlyOwner isValidTime(_marketOpeningTime) {

        // Gets current marketOpeningTime.
        uint256 _oldMarketOpeningTime = marketOpeningTime;

        require(
            _marketOpeningTime != _oldMarketOpeningTime,
            "_setMarketOpeningTime: marketOpeningTime has been set!"
        );

        // Sets new marketOpeningTime.
        marketOpeningTime = _marketOpeningTime;

        emit SetMarketOpeningTime(_oldMarketOpeningTime, _marketOpeningTime);
    }

    /**
     * @notice Set new duration.
     * @dev Owner function to change of duration.
     * @param _duration New duration.
     */
    function _setDuration(uint256 _duration) public onlyOwner isValidTime(_duration) {

        // Gets current duration.
        uint256 _oldDuration = duration;

        require(
            _duration != _oldDuration,
            "_setDuration: duration has been set!"
        );

        // Sets new duration.
        duration = _duration;

        emit SetDuration(_oldDuration, _duration);
    }

    /**
     * @notice Set an unusual status for a certain day.
     * @dev Owner function to set of date unusual status.
     * @param _timestamp Unusual timestamp.
     * @param _marketOpeningTime Unusual market opening time.
     * @param _marketclosingTime Unusual market closing time.
     */
    function _setDate(uint256 _timestamp, uint256 _marketOpeningTime, uint256 _marketclosingTime) 
        public 
        onlyOwner
        isValidTime(_marketOpeningTime)
        isValidTime(_marketclosingTime) 
    {
        require(
            _marketOpeningTime != _marketclosingTime,
            "_setDate: _marketOpeningTime and _marketclosingTime cannot be the same!"
        );

        Status storage _date = date[_timestamp / 1 days];
        _date.marketOpeningTime = _marketOpeningTime;
        _date.marketclosingTime = _marketclosingTime;
        _date.activated = true;

        emit SetDate(_timestamp, _timestamp / 1 days, _marketOpeningTime, _marketclosingTime, true);
    }

    function _setDateBatch(uint256[] calldata _timestamps, uint256[] calldata _marketOpeningTimes, uint256[] calldata _marketclosingTimes) external {
        require(
            _timestamps.length == _marketOpeningTimes.length && _marketOpeningTimes.length == _marketclosingTimes.length ,
            "_setDate: _timestamps & _marketOpeningTimes & _marketclosingTimes must match the current length!"
        );

        for (uint256 i = 0; i < _timestamps.length; i++) {
            _setDate(_timestamps[i], _marketOpeningTimes[i], _marketclosingTimes[i]);
        }
    }

    /**
     * @notice Cancel the unusual status.
     * @dev Owner function cancels unusual status.
     * @param _timestamp Unusual timestamp.
     */
    function _disableDate(uint256 _timestamp) public onlyOwner {

        Status storage _date = date[_timestamp / 1 days];
        _date.marketOpeningTime = 0;
        _date.marketclosingTime = 0;
        _date.activated = false;

        emit SetDate(_timestamp, _timestamp / 1 days, 0, 0, false);
    }

    function _disableDateBatch(uint256[] calldata _timestamps) external {
        for (uint256 i = 0; i < _timestamps.length; i++) {
            _disableDate(_timestamps[i]);
        }
    }

    /**
     * @notice Called by the contract owner to unpause, returns to normal status.
     * @dev clear pauseTime.
     */
    function _unpause() external onlyOwner {
        uint256 _oldPauseTime;
        (_oldPauseTime, pauseTime) = (pauseTime, 0);
        emit SetPauseTime(_oldPauseTime, 0);
    }

    /**
     * @notice Called by the contract owner to unpause an asset, returns to normal status.
     * @dev clear assetPauseTime.
     * @param _asset Asset for which to set the `assetPauseTime`.
     */
    function _unpauseAsset(address _asset) external onlyOwner {
        uint256 _oldAssetPauseTime;
        (_oldAssetPauseTime, assetPauseTime[_asset]) = (assetPauseTime[_asset], 0);
        emit SetAssetPauseTime(_asset, _oldAssetPauseTime, 0);
    }

    /**
     * @notice Called by the contract pauser or owner to pause, triggers stopped status.
     * @dev Set pauseTime to the current timestamp.
     */
    function pause() external pauserAndOwner {
        uint256 _oldPauseTime;
        (_oldPauseTime, pauseTime) = (pauseTime, block.timestamp);
        emit SetPauseTime(_oldPauseTime, pauseTime);
    }

    /**
     * @notice Called by the contract pauser or owner to pause an asset, triggers stopped status.
     * @dev Set assetPauseTime to the current timestamp.
     * @param _asset Asset for which to set the `assetPauseTime`.
     */
    function pauseAsset(address _asset) external pauserAndOwner {
        uint256 _oldAssetPauseTime;
        (_oldAssetPauseTime, assetPauseTime[_asset]) = (assetPauseTime[_asset], block.timestamp);
        emit SetAssetPauseTime(_asset, _oldAssetPauseTime, assetPauseTime[_asset]);
    }

    /**
     * @notice Get asset opening status.
     * @dev Calculate the daily opening and closing time, filter weekends and other.
     * @param _asset Asset for which to get the status.
     * @param _timestamp Timestamp for which to get the status.
     * @return true: available,false: unavailable.
     */
    function _getAssetStatus(address _asset, uint256 _timestamp) internal view returns (bool) {

        // Timestamp converted to the corresponding time zone.
        uint256 _timeZone = uint256(timeZone);
        uint256 _localTime = _timestamp + _timeZone;

        // Greenwich Mean Time starts on Thursday. (_localTime % 1 weeks) / 1 days == 0, Thursday in this time zone.
        // ((_localTime + 3 days) % 1 weeks) / 1 days == 0, Monday in this time zone,
        // 0: Monday; 1: Tuesday; 2: Wednesday; 3: Thursday; 4: Friday; 5: Saturday; 6: Sunday.
        uint256 _secondsPassedInWeek = _localTime.add(3 days) % 1 weeks;
        // Filter weekend
        if (_secondsPassedInWeek / 1 days > 4)
            return false;

        (uint256 _marketOpeningTime, uint256 _marketclosingTime) = (marketOpeningTime, marketOpeningTime + duration);
        // When the non-normal status has been activated, update the opening and closing time.
        Status storage _date = date[_localTime / 1 days];
        if (_date.activated)
            (_marketOpeningTime, _marketclosingTime) = (_date.marketOpeningTime, _date.marketclosingTime);

        // Calculate the time of day
        uint256 _secondsPassedInDay = _secondsPassedInWeek % 1 days;

        // Filter before opening and after closing
        if (_secondsPassedInDay < _marketOpeningTime || _secondsPassedInDay > _marketclosingTime)
            return false;

        uint256 _pauseTime = assetPauseTime[_asset] > pauseTime ? assetPauseTime[_asset] : pauseTime;
        // Filter pause time, when the pause time and local time are on the same day.
        if ((_pauseTime + _timeZone) / 1 days == _localTime / 1 days)
            return false;

        return true;
    }

    /**
     * @notice Get asset opening status.
     * @dev Get the asset status of the current block time.
     * @param _asset Asset for which to get the status.
     * @return true: available,false: unavailable.
     */
    function getAssetPriceStatus(address _asset) external view returns (bool) {
        return _getAssetStatus(_asset, block.timestamp);
    }

    function getAssetStatus(address _asset, uint256 _timestamp) external view returns (bool) {
        return _getAssetStatus(_asset, _timestamp);
    }

    /**
     * @dev Get timeZone.
     * @return Time zone (in seconds).
     */
    function getTimeZone() external view returns (int256) {
        return timeZone;
    }

    /**
     * @dev Get market opening time.
     * @return Market opening time (in seconds).
     */
    function getMarketOpeningTime() external view returns (uint256) {
        return marketOpeningTime;
    }

    /**
     * @dev Get duration.
     * @return Duration (in seconds).
     */
    function getDuration() external view returns (uint256) {
        return duration;
    }

    /**
     * @dev Get unusual opening and closing information.
     * @param _timestamp Unusual timestamp.
     * @return timestamp key, Active status, Unusual market opening time, Unusual market closing time .
     */
    function getDateInfo(uint256 _timestamp) external view returns (uint256, bool ,uint256, uint256) {
        uint256 _key = _timestamp / 1 days;
        Status storage _date = date[_key];
        return (_key, _date.activated, _date.marketOpeningTime, _date.marketclosingTime);
    }

    /**
     * @dev Get pauseTime.
     * @return Pause the timestamp.
     */
    function getPauseTime() external view returns (uint256) {
        return pauseTime;
    }
    
    /**
     * @dev Get assetPauseTime.
     * @param _asset Asset for which to set the `assetPauseTime`.
     * @return Asset pause timestamp.
     */
    function getAssetPauseTime(address _asset) external view returns (uint256) {
        return assetPauseTime[_asset];
    }
}
