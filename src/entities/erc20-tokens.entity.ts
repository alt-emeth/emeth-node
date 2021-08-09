import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn, getRepository } from 'typeorm';

import { ViewErc20Tokens } from './v_erc20_tokens.entity';

export interface Erc20TokensDtoCreate {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  icon?: string;
}
@Entity('erc20_tokens')
export class Erc20Tokens {
  @PrimaryColumn({
    name: 'address',
    type: 'varchar',
    length: 255,
  })
  address: string;

  @Column({
    name: 'name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  name: string;

  @Column({
    name: 'symbol',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  symbol: string;

  @Column({
    name: 'decimals',
    type: 'tinyint',
    nullable: true,
  })
  decimals: number;

  @Column({
    name: 'icon',
    type: 'varchar',
    nullable: true,
    length: 255,
  })
  icon: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'modified_at',
    type: 'datetime',
  })
  modifiedAt: Date;

  static async initData() {
    try {
      const nativeTokenId = process.env.NATIVE_TOKEN_ID;
      const erc20TokensRepository = getRepository(Erc20Tokens);
      const nativeToken = await erc20TokensRepository.findOne({ address: nativeTokenId });

      if (!nativeToken) {
        await erc20TokensRepository.save({
          address: nativeTokenId,
          name: process.env.NATIVE_TOKEN_NAME,
          symbol: process.env.NATIVE_TOKEN_SYMBOL,
          icon: process.env.NATIVE_TOKEN_ICON,
          decimals: Number(process.env.NATIVE_TOKEN_DECIMALS),
        });
      }
    } catch (error) {
      const errMsg = `ERC20 token initData error: ${error.message}`;
      throw new Error(errMsg);
    }
  }

  static async findByAddress(address: string) {
    try {
      const erc20TokensRepository = getRepository(Erc20Tokens);
      const result = await erc20TokensRepository.findOne(address);
      return result;
    } catch (error) {
      const errMsg = `[erc20Tokens][findByAddress] ${error.message}`;
      throw new Error(errMsg);
    }
  }

  static async count() {
    try {
      const erc20TokenRepository = getRepository(Erc20Tokens);
      const total = await erc20TokenRepository.count();

      return total;
    } catch (error) {
      const errMsg = `[erc20Tokens][count] ${error.message}`;
      throw new Error(errMsg);
    }
  }

  static async findAndCount(skip = 0, take = 10) {
    try {
      const erc20TokenRepository = getRepository(ViewErc20Tokens);
      const tokens = await erc20TokenRepository.find({
        skip,
        take,
      });
      const total = await erc20TokenRepository.count();

      return {
        tokens,
        total: total || 0,
      };
    } catch (error) {
      const errMsg = `[erc20Tokens][findAndCount] error ${error.message}`;
      throw new Error(errMsg);
    }
  }

  static async save(erc20Tokens: Erc20TokensDtoCreate) {
    try {
      const erc20TokensRepository = getRepository(Erc20Tokens);
      const result = await erc20TokensRepository.save(erc20Tokens);
      console.log(`[Erc20TOkens][create] with address: ${result.address}`);
      return result;
    } catch (error) {
      const errMsg = `[erc20Tokens][create] ${error.message}`;
      throw new Error(errMsg);
    }
  }
}
