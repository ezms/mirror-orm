export interface IDialect {
    /**
     * Wraps an identifier (table or column name) in the appropriate
     * quoting characters for this database, escaping any internal occurrences
     * of the quote character.
     *
     * PostgreSQL: "identifier"  (double-quote, escape " → "")
     * MySQL:      `identifier`  (backtick, escape ` → ``)
     * SQL Server: [identifier]  (brackets, escape ] → ]])
     */
    quoteIdentifier(identifier: string): string;

    /**
     * Returns the parameter placeholder for the given 1-based index.
     *
     * PostgreSQL: $1, $2, $3
     * MySQL/SQLite: ? (index ignored)
     * Oracle: :1, :2, :3
     * SQL Server: @p1, @p2, @p3
     */
    placeholder(index: number): string;

    /**
     * Whether this database supports RETURNING after INSERT/UPDATE/DELETE.
     * PostgreSQL: true. MySQL, SQLite (< 3.35), SQL Server: false.
     */
    readonly supportsReturning: boolean;

    /**
     * Whether this database supports OUTPUT INSERTED.* inline in INSERT/UPDATE.
     * SQL Server: true. PostgreSQL uses RETURNING instead. MySQL/SQLite: false.
     * When true, the OUTPUT clause is injected before VALUES (INSERT) or before WHERE (UPDATE).
     */
    readonly supportsOutputInserted?: boolean;

    /**
     * Whether this dialect supports PostgreSQL JSON operators (@>, ?, ?&, ?|).
     * PostgreSQL: true. All other dialects: false — using JSON operators on
     * unsupported dialects throws at query-build time.
     */
    readonly supportsJsonOperators?: boolean;

    /**
     * SQL to retrieve the last auto-generated row ID after an INSERT.
     * Only required when supportsReturning is false and identity strategy is used.
     *
     * SQLite: 'SELECT last_insert_rowid() AS _lid'
     * MySQL:  'SELECT LAST_INSERT_ID() AS _lid'
     * PostgreSQL: undefined (uses RETURNING)
     */
    readonly lastInsertIdQuery?: string;

    /**
     * Builds an IN/ANY clause for an array of values, adapting to the dialect.
     *
     * PostgreSQL: pushes the array as a single param → "col = ANY($N)"
     * Others: pushes each value individually → "col IN (?, ?, ?)"
     */
    buildArrayInClause(quotedColumn: string, ids: unknown[], params: unknown[]): string;
}
