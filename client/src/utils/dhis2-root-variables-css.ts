import { colors, elevations, spacers, theme } from '@dhis2/ui-constants'

const layers = {
    applicationTop: 2000,
    blocking: 3000,
    alert: 9999,
} as const satisfies Record<string, number>

const serializePrefixed = (prefix: string, obj: Record<string, string | number>): string =>
    Object.entries(obj)
        .map(([key, value]) => `--${prefix}-${key}:${value}`)
        .join(';')

/** `:root` block matching `<CssVariables colors theme layers spacers elevations />` for standalone HTML exports. */
export const dhis2HtmlRootVariablesCss = (): string =>
    `:root{${[
        serializePrefixed('colors', colors),
        serializePrefixed('theme', theme),
        serializePrefixed('elevations', elevations),
        serializePrefixed('spacers', spacers),
        serializePrefixed('layers', layers),
    ].join(';')}}`
