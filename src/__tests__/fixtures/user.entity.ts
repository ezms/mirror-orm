import { Column } from '../../decorators/column';
import { Entity } from '../../decorators/entity';
import { ManyToOne } from '../../decorators/many-to-one';
import { OneToMany } from '../../decorators/one-to-many';
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

@Entity('accounts')
export class AccountFixture {
    @PrimaryColumn({ strategy: 'identity' })
    id!: number;

    @Column({ type: 'number' })
    balance!: number;

    @Column({ name: 'is_active', type: 'boolean' })
    isActive!: boolean;

    @Column({ name: 'created_at', type: 'datetime' })
    createdAt!: Date;

    @Column()
    label!: string;
}

@Entity('authors')
export class AuthorFixture {
    @PrimaryColumn({ strategy: 'identity' })
    id!: number;

    @Column()
    name!: string;

    @OneToMany(() => BookFixture, 'author_id')
    books!: BookFixture[];
}

@Entity('books')
export class BookFixture {
    @PrimaryColumn({ strategy: 'identity' })
    id!: number;

    @Column()
    title!: string;

    @Column({ name: 'author_id' })
    authorId!: number;

    @ManyToOne(() => AuthorFixture, 'author_id')
    author!: AuthorFixture;
}

@Entity('categories')
export class CategoryFixture {
    @PrimaryColumn({ strategy: 'identity' })
    id!: number;

    @Column()
    name!: string;
}

// Entidade com 2× ManyToOne + type cast num campo próprio
@Entity('rich_books')
export class RichBookFixture {
    @PrimaryColumn({ strategy: 'identity' })
    id!: number;

    @Column()
    title!: string;

    @Column({ name: 'author_id' })
    authorId!: number;

    @Column({ name: 'category_id' })
    categoryId!: number;

    @Column({ name: 'published_at', type: 'datetime' })
    publishedAt!: Date;

    @ManyToOne(() => AuthorFixture, 'author_id')
    author!: AuthorFixture;

    @ManyToOne(() => CategoryFixture, 'category_id')
    category!: CategoryFixture;
}
