import { Column } from '../../decorators/column';
import { Entity } from '../../decorators/entity';
import { PrimaryColumn } from '../../decorators/primary-column';

@Entity('users')
export class UserFixture {
    @PrimaryColumn({ strategy: 'identity' })
    id!: number;

    @Column('name')
    name!: string;

    @Column({ nullable: true })
    email!: string;
}

@Entity('posts')
export class PostFixture {
    @PrimaryColumn({ strategy: 'uuid_v4' })
    id!: string;

    @Column()
    title!: string;
}
