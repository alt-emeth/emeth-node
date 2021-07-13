import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

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
}
