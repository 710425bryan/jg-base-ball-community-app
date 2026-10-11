import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { configureWebPush } from './webPushConfig'

const configuredKeys: Record<string, string> = {
  VAPID_SUBJECT: 'mailto:push@example.test',
  VAPID_PUBLIC_KEY: 'test-configured-public-key',
  VAPID_PRIVATE_KEY: 'test-configured-private-key',
}

describe('Web Push secret configuration', () => {
  it('uses exactly the configured pair without a fallback key', () => {
    const setVapidDetails = vi.fn()
    configureWebPush({ setVapidDetails }, name => configuredKeys[name])
    expect(setVapidDetails).toHaveBeenCalledOnce()
    expect(setVapidDetails).toHaveBeenCalledWith(
      configuredKeys.VAPID_SUBJECT, configuredKeys.VAPID_PUBLIC_KEY, configuredKeys.VAPID_PRIVATE_KEY
    )
  })

  it.each(Object.keys(configuredKeys))('fails closed without %s and never includes other secret values in the error', missing => {
    const setVapidDetails = vi.fn()
    const configure = () => configureWebPush({ setVapidDetails }, name => name === missing ? undefined : configuredKeys[name])
    expect(configure).toThrow(`Web Push configuration is missing: ${missing}`)
    expect(setVapidDetails).not.toHaveBeenCalled()
  })

  it('rejects empty and whitespace settings before initialization', () => {
    const setVapidDetails = vi.fn()
    expect(() => configureWebPush({ setVapidDetails }, () => '   ')).toThrow('Web Push configuration is missing:')
    expect(setVapidDetails).not.toHaveBeenCalled()
  })

  it.each(['push.ts', '../send-training-registration-notifications/index.ts'])('initializes %s only from secrets with no embedded VAPID material', path => {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
    let literalCredentials = 0
    let usesEnvironmentConfiguration = false
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
        && /vapid|privatekey|publickey/i.test(node.name.text)
        && node.initializer && ts.isStringLiteral(node.initializer)) literalCredentials += 1
      if (ts.isCallExpression(node) && node.expression.getText(parsed) === 'configureWebPush') {
        usesEnvironmentConfiguration = node.arguments[1]?.getText(parsed).includes('Deno.env.get(name)') === true
      }
      ts.forEachChild(node, visit)
    }
    visit(parsed)
    // Assert summaries, not source strings, so a regression cannot print secrets.
    expect(literalCredentials).toBe(0)
    expect(usesEnvironmentConfiguration).toBe(true)
  })

  it('keeps JWT verification explicitly enabled for all three training notification functions', () => {
    const config = readFileSync(new URL('../../config.toml', import.meta.url), 'utf8')
    for (const name of ['send-training-registration-notifications', 'send-training-selection-notifications', 'send-training-registration-status-notifications']) {
      expect(config).toMatch(new RegExp(`\\[functions\\.${name}\\]\\s+verify_jwt = true`))
    }
  })
})
