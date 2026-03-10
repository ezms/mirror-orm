import { MirrorError } from './mirror-error';

export class NoPrimaryColumnError extends MirrorError {
    constructor(className: string) {
        super(
            `No primary column defined on "${className}". Did you add @PrimaryColumn?`,
            'NO_PRIMARY_COLUMN',
        );
    }
}
