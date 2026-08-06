/**
 * snarkjs ships no types. Only the Groth16 surface this repo uses is declared —
 * a wider guess would be a fiction the compiler would then enforce.
 */
declare module 'snarkjs' {
  export const groth16: {
    verify(
      verificationKey: unknown,
      publicSignals: readonly string[],
      proof: unknown,
    ): Promise<boolean>;
    fullProve(
      input: Record<string, unknown>,
      wasmPath: string,
      zkeyPath: string,
    ): Promise<{ proof: unknown; publicSignals: string[] }>;
  };
}
