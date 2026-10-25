import { createHash } from 'crypto';
import { MerkleProofPathItem } from '@gateflow/shared-types';

export function hashPair(leftHex: string, rightHex: string): string {
  const leftBuf = Buffer.from(leftHex, 'hex');
  const rightBuf = Buffer.from(rightHex, 'hex');
  return createHash('sha256').update(Buffer.concat([leftBuf, rightBuf])).digest('hex');
}

export class GateFlowMerkleTree {
  private readonly leaves: string[];
  private readonly levels: string[][];

  constructor(leaves: string[]) {
    if (leaves.length === 0) {
      this.leaves = [];
      this.levels = [[createHash('sha256').update(Buffer.alloc(0)).digest('hex')]];
      return;
    }

    // Preserve deterministic leaf order
    this.leaves = [...leaves];
    this.levels = [this.leaves];
    this.buildTree();
  }

  private buildTree(): void {
    let currentLevel = this.levels[0];

    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];

      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        // If odd leaf count, duplicate last leaf to form balanced pair
        const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : currentLevel[i];
        nextLevel.push(hashPair(left, right));
      }

      this.levels.push(nextLevel);
      currentLevel = nextLevel;
    }
  }

  public getRoot(): string {
    const topLevel = this.levels[this.levels.length - 1];
    return topLevel[0];
  }

  public getLeaves(): string[] {
    return [...this.leaves];
  }

  public getProof(leafIndexOrHash: number | string): MerkleProofPathItem[] {
    let index: number;
    if (typeof leafIndexOrHash === 'string') {
      index = this.leaves.indexOf(leafIndexOrHash);
      if (index === -1) {
        throw new Error(`Leaf hash not found in Merkle tree: ${leafIndexOrHash}`);
      }
    } else {
      index = leafIndexOrHash;
      if (index < 0 || index >= this.leaves.length) {
        throw new Error(`Leaf index out of bounds: ${index}`);
      }
    }

    const proof: MerkleProofPathItem[] = [];

    for (let levelIndex = 0; levelIndex < this.levels.length - 1; levelIndex++) {
      const level = this.levels[levelIndex];
      const isEven = index % 2 === 0;
      const siblingIndex = isEven ? index + 1 : index - 1;

      if (isEven) {
        // Sibling is to the right
        const siblingHash =
          siblingIndex < level.length ? level[siblingIndex] : level[index];
        proof.push({ position: 'right', data: siblingHash });
      } else {
        // Sibling is to the left
        proof.push({ position: 'left', data: level[siblingIndex] });
      }

      index = Math.floor(index / 2);
    }

    return proof;
  }
}
