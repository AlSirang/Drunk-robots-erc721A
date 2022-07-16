const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

const whitelist = [
  "0x627306090abaB3A6e1400e9345bC60c78a8BEf57",
  "0xf17f52151EbEF6C7334FAD080c5704D77216b732",
  "0xC5fdf4076b8F3A5357c5E395ab970B5B54098Fef",
  "0x821aEa9a577a9b44299B9c15c88cf3087F3b5544",
  "0x0d1d4e623D10F9FBA5Db95830F7d3839406C6AF2",
];

// ["0x2932b7A2355D6fecc4b5c0B6BD44cC31df247a2e",
// "0x2191eF87E392377ec08E7c08Eb105Ef5448eCED5",
// "0x0F4F2Ac550A1b4e2280d04c21cEa7EBD822934b5",
// "0x6330A553Fc93768F612722BB8c2eC78aC90B3bbc",
// "0x5AEDA56215b167893e80B4fE645BA6d5Bab767DE",]

const leafNodes = whitelist.map((wallet) => keccak256(wallet));

const merkeltree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });

const temperedNodes = [
  ...whitelist,
  "0x2932b7A2355D6fecc4b5c0B6BD44cC31df247a2e",
  "0x2191eF87E392377ec08E7c08Eb105Ef5448eCED5",
];

const modifiedMerkeltree = new MerkleTree(temperedNodes, keccak256, {
  sortPairs: true,
});

function getMerkleTreeRootHash(whitelist) {
  // root hash
  return merkeltree.getRoot();
}

function getMerkleProof(address) {
  const walletHash = keccak256(address);

  return merkeltree.getHexProof(walletHash);
}

function getInvalidHash(address) {
  const walletHash = keccak256(address);
  return modifiedMerkeltree.getHexProof(walletHash);
}

function getUpdateRootHash() {
  return modifiedMerkeltree.getRoot();
}
module.exports = {
  getMerkleTreeRootHash,
  getMerkleProof,
  getInvalidHash,
  getUpdateRootHash,
};
