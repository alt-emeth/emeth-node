import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn, getRepository } from 'typeorm';

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
  })
  name: string;

  @Column({
    name: 'symbol',
    type: 'varchar',
    length: 255,
  })
  symbol: string;

  @Column({
    name: 'decimals',
    type: 'tinyint',
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

  async findByAddress(address: string) {
    try {
      const erc20TokensRepository = getRepository(Erc20Tokens);
      const result = await erc20TokensRepository.findOne(address);
      return result;
    } catch (error) {
      const errMsg = `[erc20Tokens][findByAddress] ${error.message}`;
      throw new Error(errMsg);
    }
  }

  async create(erc20Tokens: Erc20TokensDtoCreate) {
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
