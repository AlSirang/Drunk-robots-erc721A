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
const {
  getMerkleTreeRootHash,
  getMerkleProof,
  getInvalidHash,
  getUpdateRootHash,
} = require("./merkelTree");
const ERC721DrunkRobots = artifacts.require("./ERC721DrunkRobots");

contract("ERC721DrunkRobots", (accounts) => {
  const [deployer, minter, accountX, feeAccount, whitelist, blacklist] =
    accounts;
  let nft;
  let receipt;
  const BASE_URI = "https://drunkrobots.net/nft/metadata/";
  const TOKEN_URI = `${BASE_URI}0.json`;
  const NAME = "Drunk Robots";
  const SYMBOL = "DR";
  beforeEach(async () => {
    nft = await ERC721DrunkRobots.new(BASE_URI);
    await nft.togglePublicMintingStatus({ from: deployer });
    await nft.toggleWhitelistMintingStatus({ from: deployer });
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

    it("initial mint limit", async () => {
      expect(await nft.mintLimit()).to.be.bignumber.eq(new BN(20));
    });

    it("public minting status false", async () => {
      expect(await nft.isPublicMintingEnable()).to.be.eq(true);
    });

    it("whitelist minting status false", async () => {
      expect(await nft.isPublicMintingEnable()).to.be.eq(true);
    });
  });

  describe("deploy contracts, test mint:", () => {
    beforeEach(async () => {
      const mintPrice = await nft.mintPrice();
      // minting first token, id 0
      receipt = await nft.mint(1, { from: minter, value: mintPrice * 1 });
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
        nft.mint(volume, {
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
        nft.mint(volume, {
          from: minter,
          value: mintPrice * volume - 1000000,
        }),
        "low price!"
      );
    });
  });

  describe("deploy contracts, mint from reserve", function () {
    const toknesMinted = 10;
    beforeEach(async () => {
      receipt = await nft.mintFromReserve(accountX, toknesMinted, {
        from: deployer,
      });
    });

    it("balance", async () => {
      expect(await nft.balanceOf(accountX)).to.be.bignumber.equal(
        new BN(toknesMinted)
      );
    });
    it("Emitted Transfer event for all tokens", async function () {
      for (let i = 0; i < toknesMinted; i++) {
        expectEvent(receipt, "Transfer", {
          from: constants.ZERO_ADDRESS,
          to: accountX,
          tokenId: i.toString(),
        });
      }
    });

    it("Transfer all tokens to the 'to' address ", async () => {
      receipt = await nft.getPastEvents("Transfer", {
        fromBlock: 0,
        toBlock: "latest",
      });
      for (let i = 0; i < toknesMinted; i++) {
        expect(receipt[i]["args"]["from"]).to.be.equal(constants.ZERO_ADDRESS);
        expect(receipt[i]["args"]["to"]).to.be.equal(accountX);
        expect(receipt[i]["args"]["tokenId"]).to.be.bignumber.equal(new BN(i));
      }
    });
  });

  describe("deploy contracts, mint all tokens from reserve", function () {
    const toknesMinted = 200;

    beforeEach(async () => {
      await nft.mintFromReserve(deployer, toknesMinted, {
        from: deployer,
      });
    });

    it("balance", async () => {
      expect(await nft.balanceOf(deployer)).to.be.bignumber.equal(
        new BN(toknesMinted)
      );
    });

    it("should revert on reserve limit exceeded", async () => {
      await expectRevert(
        nft.mintFromReserve(minter, toknesMinted),
        "no more in reserve"
      );
    });
  });

  describe("deploy contracts, mint and test withdraw:", async () => {
    beforeEach(async () => {
      const mintPrice = await nft.mintPrice();
      const volume = 10;
      // minting first token, id 0
      receipt = await nft.mint(volume, {
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

  describe("deploy contracts, test royalty info:", () => {
    let royaltyAmount = null,
      receiver = null;
    beforeEach(async () => {
      const mintPrice = await nft.mintPrice();
      // minting first token, id 0
      receipt = await nft.mint(1, { from: minter, value: mintPrice * 1 });
      const eth = ether("1");
      ({ receiver, royaltyAmount } = await nft.royaltyInfo("0", eth));
    });

    it("royalty amount", async () => {
      const percentage = 1 * 0.035;
      expect(royaltyAmount).to.be.bignumber.equal(ether(percentage.toString()));
    });

    it("royalty receiver", async () => {
      expect(receiver).to.be.equal(nft.address);
    });
  });

  describe("deploy contracts, update royalties:", async () => {
    it("not owner ", async () => {
      await expectRevert(
        nft.setRoyalties("0", {
          from: minter,
        }),
        "Ownable: caller is not the owner"
      );
    });
    it("should revert for percentage 0 ", async () => {
      await expectRevert(
        nft.setRoyalties("0", {
          from: deployer,
        }),
        "royalties should be between 0 and 90"
      );
    });

    it("should revert for percentage more than 90", async () => {
      await expectRevert(
        nft.setRoyalties("91", {
          from: deployer,
        }),
        "royalties should be between 0 and 90"
      );
    });

    it("RoyaltiesUpdated event", async function () {
      receipt = await nft.setRoyalties("10", {
        from: deployer,
      });

      expectEvent(receipt, "RoyaltiesUpdated", {
        royalties: "10",
      });

      receipt = await nft.getPastEvents("RoyaltiesUpdated", {
        fromBlock: 0,
        toBlock: "latest",
      });

      expect(receipt[0]["returnValues"]["royalties"]).to.be.bignumber.equal(
        new BN(10)
      );
    });
    it("royalty amount", async () => {
      await nft.setRoyalties("10", {
        from: deployer,
      });

      const mintPrice = await nft.mintPrice();
      let royaltyAmount = null;
      await nft.mint(1, { from: minter, value: mintPrice * 1 });
      const eth = ether("1");
      ({ royaltyAmount } = await nft.royaltyInfo("0", eth));
      const percentage = 1 * 0.1;
      expect(royaltyAmount).to.be.bignumber.equal(ether(percentage.toString()));
    });
  });

  describe("deploy contracts, test supports interfaces:", () => {
    // supportsInterface https://docs.openzeppelin.com/contracts/4.x/api/utils#ERC165
    // Returns true if this contract implements the interface defined by interfaceId.
    // See the corresponding EIP section (https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified) to learn more about how these ids are created.
    // the interface id can be foud on the eip page https://eips.ethereum.org/EIPS/eip-721
    it("supports the IERC721 interface", async () => {
      expect(await nft.supportsInterface("0x80ac58cd")).to.be.equal(true);
    });

    it("supports the IERC721Enumerable interface", async () => {
      expect(await nft.supportsInterface("0x780e9d63")).to.be.equal(true);
    });

    it("supports the IERC721Metadata interface", async () => {
      expect(await nft.supportsInterface("0x5b5e139f")).to.be.equal(true);
    });

    it("supports the IERC165 interface", async () => {
      expect(await nft.supportsInterface("0x01ffc9a7")).to.be.equal(true);
    });

    it("supports the IERC2981 interface", async () => {
      expect(await nft.supportsInterface("0x2a55205a")).to.be.equal(true);
    });
  });

  describe("whitelist mint", () => {
    beforeEach(async () => {
      const root = getMerkleTreeRootHash([
        deployer,
        minter,
        accountX,
        feeAccount,
        whitelist,
      ]);
      await nft.setMerkleRoot(root);
    });

    it("allow to mint whitelist address(s)", async () => {
      const merkleProof = getMerkleProof(whitelist);

      const mintPrice = await nft.mintPrice();
      receipt = await nft.whitelistMint(1, merkleProof, {
        from: whitelist,
        value: mintPrice * 1,
      });

      expect(await nft.ownerOf(0)).to.be.equal(whitelist);

      expect(await nft.balanceOf(whitelist)).to.be.bignumber.equal(new BN(1));

      expectEvent(receipt, "Transfer", {
        from: constants.ZERO_ADDRESS,
        to: whitelist,
        tokenId: "0",
      });

      receipt = await nft.getPastEvents("Transfer", {
        fromBlock: 0,
        toBlock: "latest",
      });

      expect(receipt[0]["args"]["from"]).to.be.equal(constants.ZERO_ADDRESS);
      expect(receipt[0]["args"]["to"]).to.be.equal(whitelist);
      expect(receipt[0]["args"]["tokenId"]).to.be.bignumber.equal(new BN(0));
      // check that total supply matches last minted token id, subtracting 1 from totalSupply because current total supply starts at 1 while tokens start at 0
      expect(receipt[0]["args"]["tokenId"]).to.be.bignumber.equal(
        new BN((await nft.totalSupply()) - 1)
      );
    });

    it("not allow to mint none-whitelist address(s)", async () => {
      const merkleProof = getInvalidHash(blacklist);

      const mintPrice = await nft.mintPrice();
      await expectRevert(
        nft.whitelistMint(1, merkleProof, {
          from: blacklist,
          value: mintPrice * 1,
        }),
        "Invalid proof"
      );
    });

    it("not mint with valid proof but invalid whitelist address(s)", async () => {
      const merkleProof = getMerkleProof(whitelist);

      const mintPrice = await nft.mintPrice();
      await expectRevert(
        nft.whitelistMint(1, merkleProof, {
          from: blacklist,
          value: mintPrice * 1,
        }),
        "Invalid proof"
      );
    });
  });
});
