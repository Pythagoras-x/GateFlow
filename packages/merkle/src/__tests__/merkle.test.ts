import { describe, it, expect } from 'vitest';
import { AttendanceType } from '@gateflow/shared-types';
import {
  canonicalJson,
  hashLeaf,
  generateSalt,
  GateFlowMerkleTree,
  verifyMerkleProof,
  computeRootFromProof,
} from '../index';

describe('Merkle Package', () => {
  describe('Canonical JSON', () => {
    it('should sort keys alphabetically regardless of input order', () => {
      const obj1 = { z: 1, a: 2, m: { y: 'bar', b: 'foo' } };
      const obj2 = { a: 2, m: { b: 'foo', y: 'bar' }, z: 1 };

      expect(canonicalJson(obj1)).toBe(canonicalJson(obj2));
      expect(canonicalJson(obj1)).toBe('{"a":2,"m":{"b":"foo","y":"bar"},"z":1}');
    });
  });

  describe('Salted Leaf Hashing', () => {
    it('produces deterministic 32-byte (64 hex char) SHA-256 hashes', () => {
      const payload = {
        employee_ref: 'emp_12345',
        nonce: 'nonce_abc',
        site_id: 'site_nyc_hq',
        timestamp: 1715000000,
        type: AttendanceType.IN,
      };
      const salt = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

      const hash1 = hashLeaf(payload, salt);
      const hash2 = hashLeaf(payload, salt);

      expect(hash1).toHaveLength(64);
      expect(hash1).toBe(hash2);

      // Changing salt produces completely different hash
      const diffSalt = generateSalt();
      const hashDiff = hashLeaf(payload, diffSalt);
      expect(hashDiff).not.toBe(hash1);
    });
  });

  describe('Merkle Tree and Proof Verification', () => {
    it('handles empty tree correctly and throws on proof request', () => {
      const tree = new GateFlowMerkleTree([]);
      expect(tree.getRoot()).toHaveLength(64);
      expect(() => tree.getProof(0)).toThrow('Cannot generate proof for an empty tree');
    });

    it('handles single-leaf tree correctly', () => {
      const leaf = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const tree = new GateFlowMerkleTree([leaf]);

      expect(tree.getRoot()).toBe(leaf);
      const proof = tree.getProof(0);
      expect(proof).toHaveLength(0);
      expect(verifyMerkleProof(leaf, proof, tree.getRoot())).toBe(true);
    });

    it('generates and verifies valid proofs for even leaf counts (e.g. 4 leaves)', () => {
      const leaves = [
        '1111111111111111111111111111111111111111111111111111111111111111',
        '2222222222222222222222222222222222222222222222222222222222222222',
        '3333333333333333333333333333333333333333333333333333333333333333',
        '4444444444444444444444444444444444444444444444444444444444444444',
      ];
      const tree = new GateFlowMerkleTree(leaves);
      const root = tree.getRoot();

      leaves.forEach((leaf, idx) => {
        const proof = tree.getProof(idx);
        expect(proof).toHaveLength(2);
        expect(computeRootFromProof(leaf, proof)).toBe(root);
        expect(verifyMerkleProof(leaf, proof, root)).toBe(true);
      });
    });

    it('generates and verifies valid proofs for odd leaf counts (e.g. 3 and 5 leaves)', () => {
      const oddCounts = [3, 5, 7];

      for (const count of oddCounts) {
        const leaves = Array.from({ length: count }, (_, i) =>
          (i + 1).toString(16).padStart(64, '0')
        );

        const tree = new GateFlowMerkleTree(leaves);
        const root = tree.getRoot();

        leaves.forEach((leaf, idx) => {
          const proof = tree.getProof(idx);
          expect(verifyMerkleProof(leaf, proof, root)).toBe(true);
        });
      }
    });

    it('detects tampered leaf data', () => {
      const leaves = [
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      ];
      const tree = new GateFlowMerkleTree(leaves);
      const root = tree.getRoot();
      const proof = tree.getProof(0);

      const tamperedLeaf = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
      expect(verifyMerkleProof(tamperedLeaf, proof, root)).toBe(false);
    });

    it('detects tampered proof sibling data or inverted position', () => {
      const leaves = [
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      ];
      const tree = new GateFlowMerkleTree(leaves);
      const root = tree.getRoot();
      const proof = tree.getProof(1);

      // Tamper sibling data
      const tamperedProofData = proof.map((p, i) =>
        i === 0 ? { ...p, data: '0000000000000000000000000000000000000000000000000000000000000000' } : p
      );
      expect(verifyMerkleProof(leaves[1], tamperedProofData, root)).toBe(false);

      // Invert position
      const invertedPositionProof = proof.map((p, i) =>
        i === 0 ? { ...p, position: p.position === 'left' ? ('right' as const) : ('left' as const) } : p
      );
      expect(verifyMerkleProof(leaves[1], invertedPositionProof, root)).toBe(false);
    });

    it('detects mismatched root hash', () => {
      const leaves = [
        '1111111111111111111111111111111111111111111111111111111111111111',
        '2222222222222222222222222222222222222222222222222222222222222222',
      ];
      const tree = new GateFlowMerkleTree(leaves);
      const proof = tree.getProof(0);
      const wrongRoot = '0000000000000000000000000000000000000000000000000000000000000000';

      expect(verifyMerkleProof(leaves[0], proof, wrongRoot)).toBe(false);
    });
  });
});
