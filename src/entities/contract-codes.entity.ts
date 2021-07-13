import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('contract_codes')
export class ContractCodes {
  @PrimaryColumn({
    name: 'address',
    type: 'varchar',
    length: 255,
  })
  address: string;

  @Column({
    name: 'compiler',
    type: 'varchar',
    length: 255,
  })
  compiler: string;

  @Column({
    name: 'optimization',
    type: 'int',
  })
  optimization: number;

  @Column({
    name: 'code',
    type: 'text',
  })
  code: string;

  @Column({
    name: 'constructor_args',
    type: 'text',
  })
  constructorArgs: string;

  @Column({
    name: 'abi',
    type: 'text',
  })
  abi: string;

  @Column({
    name: 'evm_version',
    type: 'varchar',
    length: 255,
  })
  evmVersion: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'datetime',
  })
  createdAt: Date;
}
