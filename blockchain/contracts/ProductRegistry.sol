// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * ProductRegistry Smart Contract
 * Network: Polygon Amoy Testnet
 *
 * productHash: SHA256 hash of core product data
 *   (productId + name + batchNumber + manufactureDate + manufacturerId)
 *   Used for tamper detection. If product data changes,
 *   hash changes and verification fails.
 *
 * ipfsImageHash: IPFS CID of manufacturer's master reference image.
 *   Used by AI team for visual similarity comparison.
 *   Stored on blockchain as immutable reference only.
 *   AI processing happens off-chain.
 */

contract ProductRegistry {

    // ── Product States ────────────────────────────────────
    enum ProductState {
        MINTED,                // 0 - registered by manufacturer
        IN_TRANSIT,            // 1 - taken by distributor
        RECEIVED_BY_RETAILER,  // 2 - received by retailer
        SOLD,                  // 3 - verified by consumer
        FLAGGED_COUNTERFEIT    // 4 - flagged as fake
    }

    // ── Roles ─────────────────────────────────────────────
    enum Role {
        NONE,           // 0
        MANUFACTURER,   // 1
        DISTRIBUTOR,    // 2
        RETAILER        // 3
    }

    // ── Structs ───────────────────────────────────────────
    struct Product {
        string       productId;
        string       manufacturerId;
        string       productHash;      // SHA256 of product data
        string       ipfsImageHash;    // IPFS CID of master image
        uint256      mintedAt;
        ProductState state;
        bool         exists;
        address      currentOwner;
        address      authorizedDistributor; // Fix #5
        address      authorizedRetailer;    // Fix #6
    }

    struct RoleRequest {
        address requester;
        Role    requestedRole;
        string  companyName;
        bool    approved;
        bool    exists;
    }

    // ── State Variables ───────────────────────────────────
    address public admin;

    mapping(address => Role)        public  roles;
    mapping(address => string)      public  companyNames;
    mapping(address => RoleRequest) public  roleRequests;
    mapping(string  => Product)     private products;
    mapping(string  => uint256)     private scanCount;

    // ── Events ────────────────────────────────────────────
    event ProductMinted(
        string indexed productId,
        string manufacturerId,
        string productHash,
        string ipfsImageHash,
        uint256 timestamp
    );
    event StateUpdated(
        string indexed productId,
        ProductState oldState,
        ProductState newState,
        address updatedBy,
        uint256 timestamp
    );
    event ProductFlagged(
        string indexed productId,
        string reason,
        uint256 timestamp
    );
    event CustodyAssigned(
        string indexed productId,
        address distributor,
        address retailer,
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
    event ProductVerified(
        string indexed productId,
        bool genuine,
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

    // ═════════════════════════════════════════════════════
    // ROLE MANAGEMENT
    // ═════════════════════════════════════════════════════

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
        companyNames[_account] =
            roleRequests[_account].companyName;
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

    // ═════════════════════════════════════════════════════
    // PRODUCT LIFECYCLE
    // ═════════════════════════════════════════════════════

    /**
     * MANUFACTURER mints a new product token
     * Also assigns authorized distributor and retailer
     * Fix #5 and #6 - specific authorization
     */
    function mintProduct(
        string memory _productId,
        string memory _manufacturerId,
        string memory _productHash,
        string memory _ipfsImageHash,
        address _authorizedDistributor,
        address _authorizedRetailer
    ) public onlyManufacturer {
        require(
            !products[_productId].exists,
            "Product already minted"
        );
        require(
            bytes(_productId).length > 0,
            "Product ID cannot be empty"
        );
        require(
            roles[_authorizedDistributor] == Role.DISTRIBUTOR,
            "Invalid distributor address"
        );
        require(
            roles[_authorizedRetailer] == Role.RETAILER,
            "Invalid retailer address"
        );

        products[_productId] = Product({
            productId:             _productId,
            manufacturerId:        _manufacturerId,
            productHash:           _productHash,
            ipfsImageHash:         _ipfsImageHash,
            mintedAt:              block.timestamp,
            state:                 ProductState.MINTED,
            exists:                true,
            currentOwner:          msg.sender,
            authorizedDistributor: _authorizedDistributor,
            authorizedRetailer:    _authorizedRetailer
        });

        emit ProductMinted(
            _productId,
            _manufacturerId,
            _productHash,
            _ipfsImageHash,
            block.timestamp
        );
        emit CustodyAssigned(
            _productId,
            _authorizedDistributor,
            _authorizedRetailer,
            block.timestamp
        );
    }

    /**
     * DISTRIBUTOR takes custody
     * Fix #5 - only authorized distributor can move product
     */
    function transferCustody(
        string memory _productId
    ) public onlyDistributor productExists(_productId) {
        require(
            products[_productId].state == ProductState.MINTED,
            "Product must be in MINTED state"
        );
        require(
            products[_productId].authorizedDistributor
                == msg.sender,
            "Not authorized distributor for this product"
        );

        ProductState oldState = products[_productId].state;
        products[_productId].state = ProductState.IN_TRANSIT;
        products[_productId].currentOwner = msg.sender;

        emit StateUpdated(
            _productId,
            oldState,
            ProductState.IN_TRANSIT,
            msg.sender,
            block.timestamp
        );
    }

    /**
     * RETAILER receives product
     * Fix #6 - only authorized retailer can receive product
     */
    function receiveAtRetail(
        string memory _productId
    ) public onlyRetailer productExists(_productId) {
        require(
            products[_productId].state == ProductState.IN_TRANSIT,
            "Product must be IN_TRANSIT"
        );
        require(
            products[_productId].authorizedRetailer == msg.sender,
            "Not authorized retailer for this product"
        );

        ProductState oldState = products[_productId].state;
        products[_productId].state =
            ProductState.RECEIVED_BY_RETAILER;
        products[_productId].currentOwner = msg.sender;

        emit StateUpdated(
            _productId,
            oldState,
            ProductState.RECEIVED_BY_RETAILER,
            msg.sender,
            block.timestamp
        );
    }

    /**
     * BACKEND calls this on behalf of consumer
     * Fix #7  - no MetaMask needed for consumer
     * Fix #9  - removed telemetry data (city/lat/long)
     * Fix #10 - removed velocity anomaly from Solidity
     * Fix #4  - hash mismatch now changes state to FLAGGED
     * Backend handles GPS, anomaly, AI off-chain
     */
    function verifyProduct(
        string memory _productId,
        string memory _hashToCheck
    ) public productExists(_productId) returns (
        bool genuine,
        bool alreadySold,
        bool flagged,
        ProductState currentState
    ) {
        Product storage p = products[_productId];

        // Increment scan count
        scanCount[_productId]++;

        // Already flagged
        if (p.state == ProductState.FLAGGED_COUNTERFEIT) {
            emit ProductVerified(_productId, false, block.timestamp);
            return (false, false, true, p.state);
        }

        // Already sold
        if (p.state == ProductState.SOLD) {
            emit ProductVerified(_productId, false, block.timestamp);
            return (false, true, false, p.state);
        }

        // Check hash - Fix #4
        bool hashMatch = keccak256(
            abi.encodePacked(p.productHash)
        ) == keccak256(abi.encodePacked(_hashToCheck));

        if (!hashMatch) {
            // Fix #4 - change state to FLAGGED on hash mismatch
            ProductState oldState = p.state;
            p.state = ProductState.FLAGGED_COUNTERFEIT;
            emit ProductFlagged(
                _productId,
                "Hash mismatch: possible tampered product",
                block.timestamp
            );
            emit StateUpdated(
                _productId,
                oldState,
                ProductState.FLAGGED_COUNTERFEIT,
                msg.sender,
                block.timestamp
            );
            emit ProductVerified(_productId, false, block.timestamp);
            return (false, false, true, p.state);
        }

        // All good - mark as SOLD
        ProductState prevState = p.state;
        p.state = ProductState.SOLD;

        emit StateUpdated(
            _productId,
            prevState,
            ProductState.SOLD,
            msg.sender,
            block.timestamp
        );
        emit ProductVerified(_productId, true, block.timestamp);

        return (true, false, false, p.state);
    }

    /**
     * ADMIN or BACKEND flags counterfeit
     * Fix #11 - state permanently FLAGGED
     * Backend calls this when AI or anomaly detected
     */
    function flagCounterfeit(
        string memory _productId,
        string memory _reason
    ) public onlyAdmin productExists(_productId) {
        // Fix #11 - cannot unflag once flagged
        require(
            products[_productId].state !=
                ProductState.FLAGGED_COUNTERFEIT,
            "Already flagged"
        );

        ProductState oldState = products[_productId].state;
        products[_productId].state =
            ProductState.FLAGGED_COUNTERFEIT;

        emit StateUpdated(
            _productId,
            oldState,
            ProductState.FLAGGED_COUNTERFEIT,
            msg.sender,
            block.timestamp
        );
        emit ProductFlagged(_productId, _reason, block.timestamp);
    }

    // ═════════════════════════════════════════════════════
    // VIEW FUNCTIONS (Fix #16)
    // ═════════════════════════════════════════════════════

    function getProduct(
        string memory _productId
    ) public view productExists(_productId) returns (
        string memory productId,
        string memory manufacturerId,
        string memory productHash,
        string memory ipfsImageHash,
        uint256 mintedAt,
        ProductState state,
        address currentOwner,
        address authorizedDistributor,
        address authorizedRetailer
    ) {
        Product memory p = products[_productId];
        return (
            p.productId,
            p.manufacturerId,
            p.productHash,
            p.ipfsImageHash,
            p.mintedAt,
            p.state,
            p.currentOwner,
            p.authorizedDistributor,
            p.authorizedRetailer
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
        return scanCount[_productId];
    }

    function isProductFlagged(
        string memory _productId
    ) public view productExists(_productId)
    returns (bool) {
        return products[_productId].state ==
            ProductState.FLAGGED_COUNTERFEIT;
    }
}