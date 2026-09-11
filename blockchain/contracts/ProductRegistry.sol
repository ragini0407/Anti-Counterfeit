// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract ProductRegistry {

    // ── Product States ──────────────────────────────────
    enum ProductState {
        MINTED,
        IN_TRANSIT,
        RECEIVED_BY_RETAILER,
        SOLD,
        FLAGGED_COUNTERFEIT
    }

    // ── Roles ────────────────────────────────────────────
    enum Role {
        NONE,
        MANUFACTURER,
        DISTRIBUTOR,
        RETAILER
    }

    // ── Structs ──────────────────────────────────────────
    struct Product {
        string       productId;
        string       manufacturerId;
        string       productHash;
        string       ipfsImageHash;
        uint256      mintedAt;
        ProductState state;
        bool         exists;
        address      currentOwner;
    }

    struct ScanLog {
        string   productId;
        string   city;
        string   country;
        int256   latitude;
        int256   longitude;
        uint256  timestamp;
        address  scanner;
    }

    struct RoleRequest {
        address  requester;
        Role     requestedRole;
        string   companyName;
        bool     approved;
        bool     exists;
    }

    // ── State Variables ───────────────────────────────────
    address public admin;

    mapping(address => Role)        public  roles;
    mapping(address => string)      public  companyNames;
    mapping(address => RoleRequest) public  roleRequests;
    mapping(string  => Product)     private products;
    mapping(string  => ScanLog[])   private scanHistory;
    mapping(string  => uint256)     private lastScanTime;
    mapping(string  => string)      private lastScanCity;

    // ── Events ────────────────────────────────────────────
    event ProductMinted(
        string indexed productId,
        string manufacturerId,
        string ipfsImageHash,
        uint256 timestamp
    );
    event StateUpdated(
        string indexed productId,
        ProductState oldState,
        ProductState newState,
        uint256 timestamp
    );
    event ProductFlagged(
        string indexed productId,
        string reason,
        uint256 timestamp
    );
    event RoleRequested(
        address indexed requester,
        Role requestedRole,
        string companyName
    );
    event RoleApproved(
        address indexed account,
        Role role
    );
    event RoleRevoked(
        address indexed account
    );
    event ScanLogged(
        string indexed productId,
        string city,
        int256 latitude,
        int256 longitude,
        uint256 timestamp
    );

    // ── Modifiers ─────────────────────────────────────────
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier onlyManufacturer() {
        require(
            roles[msg.sender] == Role.MANUFACTURER,
            "Only manufacturer"
        );
        _;
    }

    modifier onlyDistributor() {
        require(
            roles[msg.sender] == Role.DISTRIBUTOR,
            "Only distributor"
        );
        _;
    }

    modifier onlyRetailer() {
        require(
            roles[msg.sender] == Role.RETAILER,
            "Only retailer"
        );
        _;
    }

    modifier productExists(string memory _productId) {
        require(products[_productId].exists, "Product not found");
        _;
    }

    // ── Constructor ───────────────────────────────────────
    constructor() {
        admin = msg.sender;
    }

    // ══════════════════════════════════════════════════════
    // ROLE MANAGEMENT
    // ══════════════════════════════════════════════════════

    function requestRole(
        Role _role,
        string memory _companyName
    ) public {
        require(_role != Role.NONE, "Invalid role");
        require(
            roles[msg.sender] == Role.NONE,
            "Already has a role"
        );

        roleRequests[msg.sender] = RoleRequest({
            requester:     msg.sender,
            requestedRole: _role,
            companyName:   _companyName,
            approved:      false,
            exists:        true
        });

        emit RoleRequested(msg.sender, _role, _companyName);
    }

    function approveRole(address _account) public onlyAdmin {
        require(
            roleRequests[_account].exists,
            "No request found"
        );
        require(
            !roleRequests[_account].approved,
            "Already approved"
        );

        roles[_account] = roleRequests[_account].requestedRole;
        companyNames[_account] = roleRequests[_account].companyName;
        roleRequests[_account].approved = true;

        emit RoleApproved(_account, roles[_account]);
    }

    function revokeRole(address _account) public onlyAdmin {
        require(
            roles[_account] != Role.NONE,
            "No role to revoke"
        );
        roles[_account] = Role.NONE;
        emit RoleRevoked(_account);
    }

    function getRole(
        address _account
    ) public view returns (Role) {
        return roles[_account];
    }

    // ══════════════════════════════════════════════════════
    // PRODUCT LIFECYCLE
    // ══════════════════════════════════════════════════════

    function mintProduct(
        string memory _productId,
        string memory _manufacturerId,
        string memory _productHash,
        string memory _ipfsImageHash
    ) public onlyManufacturer {
        require(
            !products[_productId].exists,
            "Product already minted"
        );
        require(
            bytes(_productId).length > 0,
            "Product ID cannot be empty"
        );

        products[_productId] = Product({
            productId:      _productId,
            manufacturerId: _manufacturerId,
            productHash:    _productHash,
            ipfsImageHash:  _ipfsImageHash,
            mintedAt:       block.timestamp,
            state:          ProductState.MINTED,
            exists:         true,
            currentOwner:   msg.sender
        });

        emit ProductMinted(
            _productId,
            _manufacturerId,
            _ipfsImageHash,
            block.timestamp
        );
    }

    function transferCustody(
        string memory _productId
    ) public onlyDistributor productExists(_productId) {
        require(
            products[_productId].state == ProductState.MINTED,
            "Product must be in MINTED state"
        );

        ProductState oldState = products[_productId].state;
        products[_productId].state = ProductState.IN_TRANSIT;
        products[_productId].currentOwner = msg.sender;

        emit StateUpdated(
            _productId,
            oldState,
            ProductState.IN_TRANSIT,
            block.timestamp
        );
    }

    function receiveAtRetail(
        string memory _productId
    ) public onlyRetailer productExists(_productId) {
        require(
            products[_productId].state == ProductState.IN_TRANSIT,
            "Product must be IN_TRANSIT"
        );

        ProductState oldState = products[_productId].state;
        products[_productId].state =
            ProductState.RECEIVED_BY_RETAILER;
        products[_productId].currentOwner = msg.sender;

        emit StateUpdated(
            _productId,
            oldState,
            ProductState.RECEIVED_BY_RETAILER,
            block.timestamp
        );
    }

    function verifyAndPurchase(
        string memory _productId,
        string memory _hashToCheck,
        string memory _city,
        int256 _latitude,
        int256 _longitude
    ) public productExists(_productId) returns (
        bool genuine,
        bool alreadySold,
        bool flagged
    ) {
        Product storage p = products[_productId];

        // Already flagged
        if (p.state == ProductState.FLAGGED_COUNTERFEIT) {
            _logScan(_productId, _city, _latitude, _longitude);
            return (false, false, true);
        }

        // Already sold - check for velocity anomaly
        if (p.state == ProductState.SOLD) {

            // Check velocity BEFORE logging new scan
            bool anomaly = _isVelocityAnomaly(_productId, _city);

            // Log the scan
            _logScan(_productId, _city, _latitude, _longitude);

            if (anomaly) {
                p.state = ProductState.FLAGGED_COUNTERFEIT;
                emit ProductFlagged(
                    _productId,
                    "Velocity anomaly: scanned in multiple cities",
                    block.timestamp
                );
                return (false, true, true);
            }

            return (false, true, false);
        }

        // Check hash matches
        bool hashMatch = keccak256(
            abi.encodePacked(p.productHash)
        ) == keccak256(abi.encodePacked(_hashToCheck));

        if (!hashMatch) {
            emit ProductFlagged(
                _productId,
                "Hash mismatch detected",
                block.timestamp
            );
            return (false, false, false);
        }

        // All good - mark as SOLD
        ProductState oldState = p.state;
        p.state = ProductState.SOLD;

        _logScan(_productId, _city, _latitude, _longitude);

        emit StateUpdated(
            _productId,
            oldState,
            ProductState.SOLD,
            block.timestamp
        );

        return (true, false, false);
    }

    function flagCounterfeit(
        string memory _productId,
        string memory _reason
    ) public onlyAdmin productExists(_productId) {
        products[_productId].state =
            ProductState.FLAGGED_COUNTERFEIT;
        emit ProductFlagged(_productId, _reason, block.timestamp);
    }

    // ══════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ══════════════════════════════════════════════════════

    function _logScan(
        string memory _productId,
        string memory _city,
        int256 _latitude,
        int256 _longitude
    ) internal {
        scanHistory[_productId].push(ScanLog({
            productId: _productId,
            city:      _city,
            country:   "",
            latitude:  _latitude,
            longitude: _longitude,
            timestamp: block.timestamp,
            scanner:   msg.sender
        }));

        lastScanTime[_productId] = block.timestamp;
        lastScanCity[_productId] = _city;

        emit ScanLogged(
            _productId,
            _city,
            _latitude,
            _longitude,
            block.timestamp
        );
    }

    function _isVelocityAnomaly(
        string memory _productId,
        string memory _currentCity
    ) internal view returns (bool) {
        // No previous scan = no anomaly
        if (lastScanTime[_productId] == 0) return false;

        // Different city?
        bool differentCity = keccak256(
            abi.encodePacked(lastScanCity[_productId])
        ) != keccak256(abi.encodePacked(_currentCity));

        // Within 5 minutes?
        bool within5Minutes =
            (block.timestamp - lastScanTime[_productId]) < 300;

        return differentCity && within5Minutes;
    }

    // ══════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ══════════════════════════════════════════════════════

    function getProduct(
        string memory _productId
    ) public view productExists(_productId) returns (
        string memory productId,
        string memory manufacturerId,
        string memory productHash,
        string memory ipfsImageHash,
        uint256 mintedAt,
        ProductState state,
        address currentOwner
    ) {
        Product memory p = products[_productId];
        return (
            p.productId,
            p.manufacturerId,
            p.productHash,
            p.ipfsImageHash,
            p.mintedAt,
            p.state,
            p.currentOwner
        );
    }

    function getProductState(
        string memory _productId
    ) public view productExists(_productId)
    returns (ProductState) {
        return products[_productId].state;
    }

    function getScanCount(
        string memory _productId
    ) public view returns (uint256) {
        return scanHistory[_productId].length;
    }

    function getScanLog(
        string memory _productId,
        uint256 index
    ) public view returns (
        string memory city,
        int256 latitude,
        int256 longitude,
        uint256 timestamp
    ) {
        ScanLog memory log = scanHistory[_productId][index];
        return (
            log.city,
            log.latitude,
            log.longitude,
            log.timestamp
        );
    }
}