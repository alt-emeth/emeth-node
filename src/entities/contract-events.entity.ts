import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('contract_events')
export class ContractEvents {
  @PrimaryColumn({
    name: 'hash',
    type: 'varchar',
    length: 255,
  })
  hash: string;

  @Column({
    name: 'event_name',
    type: 'varchar',
    length: 255,
  })
  eventName: string;

  @Column({
    name: 'event_definition',
    type: 'varchar',
    length: 255,
  })
  eventDefinition: string;
}
