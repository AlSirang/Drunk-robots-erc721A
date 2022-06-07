// SPDX-License-Identifier: MIT
pragma solidity ^0.8.1;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ERC721DrunkRobots is IERC2981, ERC721Enumerable, Ownable {
    using Strings for uint256;

    uint16 public constant ARTISTS_ROYALTIES = 1000; // the minter will get 10% for each token, which he mints, sales.
    uint16 public constant maxSupply = 10000; 
    uint16 public reserve = 350; // tokens reserve for the owner
    uint16 public publicSupply = maxSupply - reserve; // tokens avaiable for public to  mint
    uint256 public mintLimit = 20; // initially, only 20 tokens per address are allowd to mint.
    uint256 public mintPrice = 0.02 ether; // mint price per token
    string public baseURI;

    bool public mintingEnabled;
    bool internal locked;

    mapping(uint256 => address) private tokenIdToOwner; // mapping for tokenId to the creator address

    modifier noReentry() {
        require(!locked, "No re-entrancy");
        locked = true;
        _;
        locked = false;
    }

    event MintPriceUpdated(uint256 price);
    event Withdrawal(address indexed, uint256 price, uint256 time);

    constructor(string memory _baseURI) ERC721("Drunk Robots", "DR") {
        baseURI = _baseURI;
    }

    /**
     * @dev private function to mint given amount of tokens.
     * @param to is the address to which the tokens will be minted
     * @param amount is the quantity of tokens to be minted
     */
    function mint(address to, uint16 amount) private {
        require(to != address(0x0), "cannot mint to null address");
        require(
            (totalSupply() + amount) <= maxSupply,
            "Request will exceed max supply!"
        );

        for (uint16 i = 0; i < amount; i++) {
            tokenIdToOwner[totalSupply()] = to;
            _safeMint(msg.sender, totalSupply());
        }
    }

    /**
     * @dev  It will mint from tokens allocated for public for owner.
     * @param volume is the quantity of tokens to be minted
     */
    function publicMint(uint16 volume) public payable noReentry {
        require(mintingEnabled == true, "minting is not enabled");
        require(volume > 0, "You Must Mint at least one token");
        require(
            totalSupply() <= publicSupply &&
                balanceOf(msg.sender) + volume <= mintLimit,
            "no more tokens than mint limit"
        );
        require(msg.value >= mintPrice * volume, "low price!");
        mint(msg.sender, volume);
    }

    /***************************/
    /***** VIEW FUNCTIONS *****/
    /***************************/

    /**
     * @dev it will return tokenURI for given tokenIdToOwner
     * @param _tokenId is valid token id mint in this contract
     */
    function tokenURI(uint256 _tokenId)
        public
        view
        override
        returns (string memory)
    {
        require(
            _exists(_tokenId),
            "ERC721Metadata: URI query for nonexistent token"
        );
        return string(abi.encodePacked(baseURI, _tokenId.toString(), ".json"));
    }

    /**
     * @dev it will return balance of contract
     */
    function getContractBalance() public view returns (uint256) {
        return address(this).balance;
    }

    /***************************/
    /***** ADMIN FUNCTIONS *****/
    /***************************/

    /**
     * @dev mint function only callable by the Contract owner. It will mint from reserve tokens for owner.
     * @param to is the address to which the tokens will be minted
     * @param amount is the quantity of tokens to be minted
     */
    function mintFromReserve(address to, uint16 amount) external onlyOwner {
        require(amount <= reserve, "no more reserve!");
        mint(to, amount);
        reserve -= amount;
    }

    /**
     * @dev it will update mint price.
     * @param _mintPrice is new value for mint
     */
    function setMintPrice(uint256 _mintPrice) external onlyOwner {
        mintPrice = _mintPrice;
        emit MintPriceUpdated(_mintPrice);
    }

    /**
    *
    * @dev it will update the mint limit aka amount of nfts a wallet can hold.
    * @param _mintLimit is new value for the limit
    */
    function setMintLimit(uint256 _mintLimit) external onlyOwner{
        mintLimit = _mintLimit;
    }

    /**
     * @dev it will update baseURI for tokens.
     * @param _baseURI is new URI for tokens
     */
    function setBaseURI(string memory _baseURI) external onlyOwner {
        baseURI = _baseURI;
    }

    /**
     * @dev it is only callable by Contract owner. it will toggle minting status.
     */
    function toggleMinting() external onlyOwner {
        mintingEnabled = !mintingEnabled;
    }

    /**
     * @dev it is only callable by Contract owner. it will withdraw balace of contract.
     */
    function withdraw() external onlyOwner noReentry {
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
        override(IERC165, ERC721Enumerable)
        returns (bool)
    {
        return
            _interfaceId == type(IERC2981).interfaceId ||
            super.supportsInterface(_interfaceId);
    }

    /**
     *  @dev it retruns the amount of royalty the owner will recive for
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
        return (
            tokenIdToOwner[_tokenId],
            (_salePrice * ARTISTS_ROYALTIES) / 10000
        );
    }

    receive() external payable {}

    fallback() external payable {}
}
