import { MerkleProofPathItem } from '@gateflow/shared-types';
import { hashPair } from './tree';

/**
 * Recomputes the Merkle root from a leaf and its proof path.
 */
export function computeRootFromProof(
  leafHex: string,
  proof: MerkleProofPathItem[]
): string {
  let current = leafHex;

  for (const step of proof) {
    if (step.position === 'left') {
      current = hashPair(step.data, current);
    } else {
      current = hashPair(current, step.data);
    }
  }

  return current;
}

/**
 * Verifies that a given leaf exists in the tree with the expected root.
 */
export function verifyMerkleProof(
  leafHex: string,
  proof: MerkleProofPathItem[],
  expectedRootHex: string
): boolean {
  if (!leafHex || !expectedRootHex) return false;
  const computedRoot = computeRootFromProof(leafHex, proof);
  return computedRoot.toLowerCase() === expectedRootHex.toLowerCase();
}
