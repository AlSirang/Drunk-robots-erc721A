console.log("Testing");

const { deployProxy } = require("@openzeppelin/truffle-upgrades");
const { expect } = require("chai");
const {
  BN, // Big Number support: Keep the returned value in its original type (BigNumber on Truffle 4.x
  constants, // Common constants, like the zero address and largest integers
  expectEvent, // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
  ether,
} = require("@openzeppelin/test-helpers"); // https://docs.openzeppelin.com/test-helpers/0.5/api
const { web3 } = require("@openzeppelin/test-environment");

const ERC721DrunkRobots = artifacts.require("./ERC721DrunkRobots");

contract("ERC721DrunkRobots", ([deployer, minter, artist, feeAccount]) => {
  let nft;
  let receipt;
  const BASE_URI = "https://drunkrobots.net/nft/metadata/";
  const TOKEN_URI = `${BASE_URI}0.json`;
  const NAME = "Drunk Robots";
  const SYMBOL = "DR";
  beforeEach(async () => {
    nft = await ERC721DrunkRobots.new(BASE_URI);
    await nft.toggleMinting({ from: deployer });
  });

  describe("deploy contracts, test state values:", () => {
    it("name", async () => {
      expect(await nft.name()).to.be.eq(NAME);
    });

    it("symbol", async () => {
      expect(await nft.symbol()).to.be.eq(SYMBOL);
    });

    it("max supply", async () => {
      expect(await nft.maxSupply()).to.be.bignumber.eq(new BN(10000));
    });

    it("reserve", async () => {
      expect(await nft.reserve()).to.be.bignumber.eq(new BN(350));
    });
    it("initial mint limit", async () => {
      expect(await nft.mintLimit()).to.be.bignumber.eq(new BN(20));
    });

    it("should be minting status false", async () => {
      expect(await nft.mintingEnabled()).to.be.eq(true);
    });
  });

  describe("deploy contracts, test mint:", () => {
    beforeEach(async () => {
      const mintPrice = await nft.mintPrice();
      // minting first token, id 0
      receipt = await nft.publicMint(1, { from: minter, value: mintPrice * 1 });
    });

    it("total supply", async () => {
      expect(await nft.totalSupply()).to.be.bignumber.eq(new BN(1));
    });

    it("BASE + TOKEN URI", async () => {
      let tokenURI = await nft.tokenURI(0);
      expect(tokenURI).to.be.equal(TOKEN_URI);
    });

    it("owner", async () => {
      expect(await nft.ownerOf(0)).to.be.equal(minter);
    });

    it("balance", async () => {
      expect(await nft.balanceOf(minter)).to.be.bignumber.equal(new BN(1));
    });

    it("Transfer event", async function () {
      expectEvent(receipt, "Transfer", {
        from: constants.ZERO_ADDRESS,
        to: minter,
        tokenId: "0",
      });

      receipt = await nft.getPastEvents("Transfer", {
        fromBlock: 0,
        toBlock: "latest",
      });

      expect(receipt[0]["args"]["from"]).to.be.equal(constants.ZERO_ADDRESS);
      expect(receipt[0]["args"]["to"]).to.be.equal(minter);
      expect(receipt[0]["args"]["tokenId"]).to.be.bignumber.equal(new BN(0));
      // check that total supply matches last minted token id, subtracting 1 from totalSupply because current total supply starts at 1 while tokens start at 0
      expect(receipt[0]["args"]["tokenId"]).to.be.bignumber.equal(
        new BN((await nft.totalSupply()) - 1)
      );
    });

    it("mint limit exceeded", async () => {
      const mintLimit = await nft.mintLimit();
      const mintPrice = await nft.mintPrice();
      const volume = mintLimit + 1;

      await expectRevert(
        nft.publicMint(volume, {
          from: minter,
          value: mintPrice * volume,
        }),
        "no more tokens than mint limit"
      );
    });

    it("low price", async () => {
      const mintLimit = await nft.mintLimit();
      const mintPrice = await nft.mintPrice();
      const volume = mintLimit - 10;

      await expectRevert(
        nft.publicMint(volume, {
          from: minter,
          value: mintPrice * volume - 1000000,
        }),
        "low price!"
      );
    });
  });

  describe("deploy contracts, test royalty info:", () => {
    let royaltyAmount = null,
      receiver = null;
    beforeEach(async () => {
      const mintPrice = await nft.mintPrice();
      // minting first token, id 0
      receipt = await nft.publicMint(1, { from: minter, value: mintPrice * 1 });
      const eth = ether("1");
      ({ receiver, royaltyAmount } = await nft.royaltyInfo("0", eth));
    });

    it("balance", async () => {
      expect(await nft.balanceOf(minter)).to.be.bignumber.equal(new BN(1));
    });

    it("royalty amount", async () => {
      expect(royaltyAmount).to.be.bignumber.equal(ether("0.1"));
    });

    it("royalty receiver", async () => {
      expect(receiver).to.be.equal(nft.address);
    });
  });

  describe("deploy contracts, mint and test withdraw:", async () => {
    beforeEach(async () => {
      const mintPrice = await nft.mintPrice();
      const volume = 10;
      // minting first token, id 0
      receipt = await nft.publicMint(volume, {
        from: minter,
        value: mintPrice * volume,
      });
    });
    it("non owner", async () => {
      await expectRevert(
        nft.withdraw({
          from: minter,
        }),
        "Ownable: caller is not the owner"
      );
    });

    it("by owner", async () => {
      receipt = await nft.withdraw({
        from: deployer,
      });
      expectEvent(receipt, "Withdrawal", {
        owner: deployer,
      });
    });
  });

  describe("deploy contracts, test supports interfaces:", () => {
    it("supports the IERC721 interface", async () => {
      // supportsInterface https://docs.openzeppelin.com/contracts/4.x/api/utils#ERC165
      // Returns true if this contract implements the interface defined by interfaceId.
      // See the corresponding EIP section (https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified) to learn more about how these ids are created.
      // the interface id can be foud on the eip page https://eips.ethereum.org/EIPS/eip-721
      expect(await nft.supportsInterface("0x80ac58cd")).to.be.equal(true);
    });

    it("supports the IERC721Enumerable interface", async () => {
      // supportsInterface https://docs.openzeppelin.com/contracts/4.x/api/utils#ERC165
      // Returns true if this contract implements the interface defined by interfaceId.
      // See the corresponding EIP section (https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified) to learn more about how these ids are created.
      // the interface id can be foud on the eip page https://eips.ethereum.org/EIPS/eip-721
      expect(await nft.supportsInterface("0x780e9d63")).to.be.equal(true);
    });

    it("supports the IERC721Metadata interface", async () => {
      // supportsInterface https://docs.openzeppelin.com/contracts/4.x/api/utils#ERC165
      // Returns true if this contract implements the interface defined by interfaceId.
      // See the corresponding EIP section (https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified) to learn more about how these ids are created.
      // the interface id can be foud on the eip page https://eips.ethereum.org/EIPS/eip-721
      expect(await nft.supportsInterface("0x5b5e139f")).to.be.equal(true);
    });

    it("supports the IERC165 interface", async () => {
      // supportsInterface https://docs.openzeppelin.com/contracts/4.x/api/utils#ERC165
      // Returns true if this contract implements the interface defined by interfaceId.
      // See the corresponding EIP section (https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified) to learn more about how these ids are created.
      // the interface id can be foud on the eip page https://eips.ethereum.org/EIPS/eip-721
      expect(await nft.supportsInterface("0x01ffc9a7")).to.be.equal(true);
    });

    it("supports the IERC2981 interface", async () => {
      // supportsInterface https://docs.openzeppelin.com/contracts/4.x/api/utils#ERC165
      // Returns true if this contract implements the interface defined by interfaceId.
      // See the corresponding EIP section (https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified) to learn more about how these ids are created.
      // the interface id can be foud on the eip page https://eips.ethereum.org/EIPS/eip-721
      expect(await nft.supportsInterface("0x2a55205a")).to.be.equal(true);
    });
  });
});
