const crypto = require("crypto");

function buildMerkleTree(hashes) {
  if (hashes.length === 0) return { root: null, proofs: [] };
  const leaves = hashes.map(function(h) { return Buffer.from(h, "hex"); });
  const tree = [leaves];
  const proofs = new Array(hashes.length).fill(null).map(function() { return []; });
  var level = 0;
  while (tree[level].length > 1) {
    var nextLevel = [];
    var currentLevel = tree[level];
    for (var i = 0; i < currentLevel.length; i += 2) {
      var left = currentLevel[i];
      var right = (i + 1 < currentLevel.length) ? currentLevel[i + 1] : left;
      var combined = Buffer.concat([left, right]);
      var parent = crypto.createHash("sha256").update(combined).digest();
      nextLevel.push(parent);
    }
    tree.push(nextLevel);
    level++;
  }
  for (var idx = 0; idx < hashes.length; idx++) {
    var index = idx;
    for (var l = 0; l < tree.length - 1; l++) {
      var isLeft = (index % 2 === 0);
      var siblingIndex = isLeft ? index + 1 : index - 1;
      var sibling = tree[l][siblingIndex] || tree[l][index];
      proofs[idx].push({ position: isLeft ? "right" : "left", hash: sibling.toString("hex") });
      index = Math.floor(index / 2);
    }
  }
  return { root: tree[tree.length - 1][0].toString("hex"), proofs: proofs };
}

function verifyMerkleProof(leafHash, proof, root) {
  var computed = Buffer.from(leafHash, "hex");
  for (var i = 0; i < proof.length; i++) {
    var step = proof[i];
    var sibling = Buffer.from(step.hash, "hex");
    if (step.position === "right") {
      computed = crypto.createHash("sha256").update(Buffer.concat([computed, sibling])).digest();
    } else {
      computed = crypto.createHash("sha256").update(Buffer.concat([sibling, computed])).digest();
    }
  }
  return computed.toString("hex") === root;
}

module.exports = { buildMerkleTree, verifyMerkleProof };
