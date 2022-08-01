// SPDX-License-Identifier: MIT

pragma solidity >=0.8.9 <0.9.0;

import "erc721a/contracts/extensions/ERC721AQueryable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract ERC721DrunkRobots is
    ERC721AQueryable,
    Ownable,
    IERC2981,
    ReentrancyGuard
{
    using Strings for uint256;

    uint256 public mintPrice = 0.02 ether; // mint price per token
    uint16 public mintLimit = 5; // initially, only 20 tokens per address are allowd to mint.
    uint16 public constant maxSupply = 10000;
    uint16 private reserve = 400; // tokens reserve for the owner
    uint16 private publicSupply = maxSupply - reserve; // tokens avaiable for public to mint
    uint16 private royalties = 500; // royalties for secondary sale

    bool public isPublicMintingEnable;
    bool public isWhitelistMintingEnable;

    string public baseURI;
    bytes32 private merkleRoot;

    modifier mintRequirements(uint16 volume) {
        require(volume > 0, "You Must Mint at least one token");
        require(
            totalSupply() <= publicSupply &&
                balanceOf(_msgSender()) + volume <= mintLimit,
            "no more tokens than mint limit"
        );
        require(msg.value >= mintPrice * volume, "low price!");
        _;
    }
    event MintPriceUpdated(uint256 price);
    event Withdrawal(address indexed owner, uint256 price, uint256 time);
    event RoyaltiesUpdated(uint256 royalties);

    constructor(string memory _uri) ERC721A("Drunk Robots", "DR") {
        baseURI = _uri;
    }

    /**
     * @dev private function to mint given amount of tokens
     * @param to is the address to which the tokens will be minted
     * @param amount is the quantity of tokens to be minted
     */
    function __mint(address to, uint16 amount) private {
        require(
            (totalSupply() + amount) <= maxSupply,
            "Request will exceed max supply!"
        );

        _safeMint(to, amount);
    }

    /**
     * @dev  it will allow the whitelisted wallets to mint tokens
     * @param volume is the quantity of tokens to be minted
     * @param _merkleProof is markel tree hash proof for the address
     */
    function whitelistMint(uint16 volume, bytes32[] calldata _merkleProof)
        external
        payable
        mintRequirements(volume)
    {
        require(isWhitelistMintingEnable, "minting is not enabled");
        bytes32 leaf = keccak256(abi.encodePacked(_msgSender()));
        require(
            MerkleProof.verify(_merkleProof, merkleRoot, leaf),
            "Invalid proof"
        );

        __mint(_msgSender(), volume);
    }

    /**
     * @dev  It will mint from tokens allocated for public for owner
     * @param volume is the quantity of tokens to be minted
     */
    function mint(uint16 volume) external payable mintRequirements(volume) {
        require(isPublicMintingEnable, "minting is not enabled");

        __mint(_msgSender(), volume);
    }

    /**
     * @dev it will return tokenURI for given tokenIdToOwner
     * @param _tokenId is valid token id mint in this contract
     */
    function tokenURI(uint256 _tokenId)
        public
        view
        override(ERC721A, IERC721A)
        returns (string memory)
    {
        require(
            _exists(_tokenId),
            "ERC721Metadata: URI query for nonexistent token"
        );
        return string(abi.encodePacked(baseURI, _tokenId.toString(), ".json"));
    }

    /***************************/
    /***** ADMIN FUNCTIONS *****/
    /***************************/

    /**
     * @dev it is only callable by Contract owner. it will toggle public minting status
     */
    function togglePublicMintingStatus() external onlyOwner {
        isPublicMintingEnable = !isPublicMintingEnable;
    }

    /**
     * @dev it is only callable by Contract owner. it will toggle whitelist minting status
     */
    function toggleWhitelistMintingStatus() external onlyOwner {
        isWhitelistMintingEnable = !isWhitelistMintingEnable;
    }

    /**
     * @dev mint function only callable by the Contract owner. It will mint from reserve tokens for owner
     * @param to is the address to which the tokens will be minted
     * @param amount is the quantity of tokens to be minted
     */
    function mintFromReserve(address to, uint16 amount) external onlyOwner {
        unchecked {
            require(amount < (reserve + 1), "no more in reserve");
        }
        reserve -= amount;
        __mint(to, amount);
    }

    /**
     * @dev it will update mint price
     * @param _mintPrice is new value for mint
     */
    function setMintPrice(uint256 _mintPrice) external onlyOwner {
        mintPrice = _mintPrice;
        emit MintPriceUpdated(_mintPrice);
    }

    /**
     *
     * @dev it will update the mint limit aka amount of nfts a wallet can hold
     * @param _mintLimit is new value for the limit
     */
    function setMintLimit(uint16 _mintLimit) external onlyOwner {
        mintLimit = _mintLimit;
    }

    function setMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        merkleRoot = _merkleRoot;
    }

    /**
     * @dev it will update baseURI for tokens
     * @param _uri is new URI for tokens
     */
    function setBaseURI(string memory _uri) external onlyOwner {
        baseURI = _uri;
    }

    /**
     * @dev it will update the royalties for token
     * @param _royalties is new percentage of royalties. it should be more than 0 and least 90
     */
    function setRoyalties(uint16 _royalties) external onlyOwner {
        require(
            _royalties > 0 && _royalties < 90,
            "royalties should be between 0 and 90"
        );

        royalties = (_royalties * 100); // convert percentage into bps

        emit RoyaltiesUpdated(_royalties);
    }

    /**
     * @dev it is only callable by Contract owner. it will withdraw balace of contract
     */
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        bool success = payable(msg.sender).send(address(this).balance);
        require(success, "Payment did not go through!");
        emit Withdrawal(msg.sender, block.timestamp, balance);
    }

    /******************************/
    /******* CONFIGURATIONS *******/
    /******************************/

    function supportsInterface(bytes4 _interfaceId)
        public
        view
        virtual
        override(ERC721A, IERC721A, IERC165)
        returns (bool)
    {
        return
            _interfaceId == type(IERC2981).interfaceId ||
            super.supportsInterface(_interfaceId);
    }

    /**
     *  @dev it retruns the amount of royalty the owner will receive for given tokenId
     *  @param _tokenId is valid token number
     *  @param _salePrice is amount for which token will be traded
     */
    function royaltyInfo(uint256 _tokenId, uint256 _salePrice)
        external
        view
        override
        returns (address receiver, uint256 royaltyAmount)
    {
        require(
            _exists(_tokenId),
            "ERC2981RoyaltyStandard: Royalty info for nonexistent token"
        );
        return (address(this), (_salePrice * royalties) / 10000);
    }

    receive() external payable {}

    fallback() external payable {}
}
