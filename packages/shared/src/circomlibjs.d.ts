/**
 * circomlibjs ships no types. Only the Poseidon surface this repo uses is
 * declared — a wider guess would be a fiction the compiler would then enforce.
 */
declare module 'circomlibjs' {
  export interface PoseidonField {
    toString(value: unknown): string;
  }

  export interface PoseidonHash {
    (inputs: readonly bigint[]): unknown;
    readonly F: PoseidonField;
  }

  export function buildPoseidon(): Promise<PoseidonHash>;
}
