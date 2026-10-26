import * as dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: process.env.JWT_SECRET || 'gateflow-default-development-secret-jwt-key!',
  jwtExpiresIn: (process.env.JWT_EXPIRES_IN || '15m') as any,
  refreshTokenExpiresIn: (process.env.REFRESH_TOKEN_EXPIRES_IN || '7d') as any,
  qrTokenTtlSeconds: parseInt(process.env.QR_TOKEN_TTL_SECONDS || '30', 10),
  stellar: {
    network: process.env.STELLAR_NETWORK || 'testnet',
    networkPassphrase: process.env.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
    rpcUrl: process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
    coreContractId: process.env.CORE_CONTRACT_ID || '',
    attendanceContractId: process.env.ATTENDANCE_CONTRACT_ID || '',
    visitorsContractId: process.env.VISITORS_CONTRACT_ID || '',
    sponsorSecret: process.env.SPONSOR_SECRET || '',
    anchorerSecret: process.env.ANCHORER_SECRET || '',
    useMock: process.env.STELLAR_USE_MOCK !== 'false',
  },
};
