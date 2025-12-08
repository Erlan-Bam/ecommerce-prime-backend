import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { TronAccount } from '../../transaction/types/tron.types';
import { TronWeb } from 'tronweb';
import { BotService } from './bot.service';
import { PrismaService } from './prisma.service';

@Injectable()
export class TronService {
  private readonly USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
  private readonly logger = new Logger(TronService.name);
  private readonly tron: AxiosInstance;
  private readonly TRON_API_KEY: string;
  private readonly TRON_WEB_API_KEY: string;
  private readonly MAIN_WALLET: string;
  private readonly MAIN_WALLET_PRIVATE_KEY: string;
  private tronweb: TronWeb;

  constructor(
    private configService: ConfigService,
    private bot: BotService,
    private prisma: PrismaService,
  ) {
    this.TRON_API_KEY = this.configService.getOrThrow('TRON_API_KEY');
    this.TRON_WEB_API_KEY = this.configService.getOrThrow('TRON_WEB_API_KEY');
    this.MAIN_WALLET = this.configService.getOrThrow('TRON_WALLET_ADDRESS');
    this.MAIN_WALLET_PRIVATE_KEY = this.configService.getOrThrow(
      'TRON_WALLET_PRIVATE_KEY',
    );

    this.tron = axios.create({
      baseURL: 'https://apilist.tronscanapi.com',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'TRON-PRO-API-KEY': this.TRON_API_KEY,
      },
    });
    this.tronweb = new TronWeb({
      fullHost: 'https://api.trongrid.io',
      headers: { 'TRON-PRO-API-KEY': this.TRON_WEB_API_KEY },
      privateKey: this.MAIN_WALLET_PRIVATE_KEY,
    });
  }

  async createAccount(): Promise<TronAccount> {
    try {
      const account: TronAccount = await this.tronweb.createAccount();
      this.logger.log(
        `New local account: ${account.address.base58}, hex: ${account.address.hex}`,
      );

      const sun = this.tronweb.toSun(0.1);
      const tx = await this.tronweb.trx.sendTransaction(
        account.address.base58,
        Number(sun),
      );

      this.logger.log(`Activation TX sent: ${tx.txid}`);

      return account;
    } catch (error) {
      this.logger.error('Error creating/activating Tron account:', error);
      throw new HttpException('Failed to create/activate TRON wallet', 500);
    }
  }

  async convertTronAmountToReadable(
    rawAmount: string,
    decimals: number = 6,
  ): Promise<string> {
    const bigIntAmount = BigInt(rawAmount);
    const scale = BigInt(10) ** BigInt(decimals);

    const whole = bigIntAmount / scale;
    const fraction = bigIntAmount % scale;

    const fractionStr = fraction.toString().padStart(decimals, '0');

    const result = `${whole}.${fractionStr}`;

    return Number(result).toFixed(2);
  }

  async getUSDTBalance(address: string) {
    try {
      const contract = await this.tronweb
        .contract()
        .at(this.USDT_CONTRACT_ADDRESS);
      const balance = await contract.balanceOf(address).call();
      return { balance: balance / 1000000, contract: contract };
    } catch (error) {
      this.logger.error(`Error getting USDT balance for ${address}:`, error);
      throw new Error(`Failed to get USDT balance: ${error.message}`);
    }
  }

  async transferUSDTToMainWallet(data: {
    address: string;
    privateKey: string;
    telegramId: string;
  }) {
    try {
      const { address, privateKey } = data;

      const tronweb = new TronWeb({
        fullHost: 'https://api.trongrid.io',
        headers: { 'TRON-PRO-API-KEY': this.TRON_WEB_API_KEY },
        privateKey,
      });

      const contract = await tronweb.contract().at(this.USDT_CONTRACT_ADDRESS);
      const balance = await contract.balanceOf(address).call({ from: address });

      if (Number(balance) <= 10000) {
        return {
          success: false,
          message: 'No USDT balance to transfer',
          balance: 0,
        };
      }

      const transaction = await contract
        .transfer(this.MAIN_WALLET, balance)
        .send({
          feeLimit: 22_000_000,
          from: address,
        });

      this.logger.log(
        `USDT transfer successful: ${transaction} - Amount: ${Number(balance) / 1e6} USDT`,
      );

      const newTrxBalance = (await tronweb.trx.getBalance(address)) / 1e6;

      try {
        await this.bot.sendMessage(
          data.telegramId,
          `Your new TRX balance is: ${newTrxBalance.toFixed(2)}`,
        );
      } catch (notifyError) {
        this.logger.error(
          `Failed to send TRX balance notification after USDT transfer: ${notifyError}`,
        );
      }

      return {
        success: true,
        transaction,
        balance: Number(balance) / 1e6,
        trxBalance: newTrxBalance,
        fromAddress: address,
        toAddress: this.MAIN_WALLET,
        message: 'USDT transferred successfully to main wallet',
      };
    } catch (error) {
      this.logger.error('Error transferring USDT:', error);
      throw new Error(`Failed to transfer USDT: ${error.message}`);
    }
  }

  async transferTRXToMainWallet(data: {
    address: string;
    privateKey: string;
    telegramId: string;
  }) {
    try {
      const { address, privateKey } = data;

      const tronweb = new TronWeb({
        fullHost: 'https://api.trongrid.io',
        headers: { 'TRON-PRO-API-KEY': this.TRON_WEB_API_KEY },
        privateKey,
      });

      const balance = await tronweb.trx.getBalance(address);
      this.logger.log(`TRX balance: ${balance / 1e6} TRX`);

      const MINIMUM_FEE_BUFFER = 0.3 * 1e6;
      if (balance <= MINIMUM_FEE_BUFFER) {
        return {
          success: false,
          message: 'Not enough TRX to transfer (need gas buffer)',
          balance: balance / 1e6,
        };
      }

      const amount = balance - MINIMUM_FEE_BUFFER;

      const tx = await tronweb.trx.sendTransaction(this.MAIN_WALLET, amount);

      this.logger.log(
        `TRX transfer successful: ${tx.txid} - Amount: ${amount / 1e6} TRX`,
      );

      const trxBalance = (await tronweb.trx.getBalance(address)) / 1e6;

      try {
        await this.bot.sendMessage(
          data.telegramId,
          `Your new TRX balance is: ${trxBalance.toFixed(2)}`,
        );
      } catch (notifyError) {
        this.logger.error(
          `Failed to send TRX balance notification after TRX transfer: ${notifyError}`,
        );
      }

      return {
        success: true,
        transaction: tx.txid,
        balanceSent: amount / 1e6,
        remainingBalance: trxBalance,
        fromAddress: address,
        toAddress: this.MAIN_WALLET,
        message: 'TRX transferred successfully to main wallet',
      };
    } catch (error) {
      this.logger.error('Error transferring TRX:', error);
      throw new Error(`Failed to transfer TRX: ${error.message}`);
    }
  }

  async transferTRXToSubWallet(data: { address: string; amount: number }) {
    try {
      const { address, amount } = data;

      const balance = await this.tronweb.trx.getBalance(this.MAIN_WALLET);
      this.logger.log(`TRX balance: ${balance / 1e6} TRX`);

      const sun = this.tronweb.toSun(amount);
      if (balance < Number(sun)) {
        return {
          success: false,
          message: 'Not enough TRX in main wallet to transfer',
          balance: balance / 1e6,
        };
      }

      const tx = await this.tronweb.trx.sendTransaction(address, Number(sun));

      this.logger.log(
        `TRX transfer successful: ${tx.txid} - Amount: ${amount / 1e6} TRX`,
      );

      return {
        success: true,
        transaction: tx.txid,
        balanceSent: amount / 1e6,
        fromAddress: address,
        toAddress: this.MAIN_WALLET,
        message: 'TRX transferred successfully to main wallet',
      };
    } catch (error) {
      this.logger.error('Error transferring TRX:', error);
      throw new Error(`Failed to transfer TRX: ${error.message}`);
    }
  }

  async getTronBalance(address: string) {
    try {
      const contract = await this.tronweb
        .contract()
        .at(this.USDT_CONTRACT_ADDRESS);
      const balance = await contract.balanceOf(address).call({ from: address });

      const tronBalance = await this.tronweb.trx.getBalance(address);

      return {
        success: true,
        balance: Number(balance) / 1_000_000,
        tronBalance: tronBalance / 1_000_000,
      };
    } catch (error) {
      this.logger.error('Error getting USDT balance:', error);
      throw new HttpException('Failed to get USDT balance', 500);
    }
  }

  async getTRXBalance(address: string): Promise<number> {
    try {
      const balance = await this.tronweb.trx.getBalance(address);
      // Convert from SUN to TRX (1 TRX = 1,000,000 SUN)
      return balance / 1000000;
    } catch (error) {
      this.logger.error(`Error getting TRX balance for ${address}: ${error}`);
      throw new Error(`Failed to get TRX balance: ${error.message}`);
    }
  }
}
