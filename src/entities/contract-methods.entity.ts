import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('contract_methods')
export class ContractMethods {
  @PrimaryColumn({
    name: 'hash',
    type: 'char',
    length: 10,
  })
  hash: string;

  @Column({
    name: 'method_name',
    type: 'varchar',
    length: 255,
  })
  methodName: string;
}
