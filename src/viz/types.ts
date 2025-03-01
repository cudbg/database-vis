interface AggFn {
    renameAs: string,
    fn: string,
    col: string | null
}

export type { AggFn }