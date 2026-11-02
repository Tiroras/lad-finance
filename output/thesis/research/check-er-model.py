"""Independent ER contracts derived from the TypeScript model and validators.

This audits the diagram data only; it is not an application test.
"""
import argparse
from collections import Counter
import hashlib
import json
import re
import subprocess
from PIL import ImageFont
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = ROOT.parents[1]
MODEL = ROOT / 'figures/er-model.json'
OUTPUT = ROOT / 'research/er-model-checks.json'

# One profile is the scope. Endpoint multiplicities are independent of drawing.
# columns: source, target, source cardinality, target cardinality, relation kind.
CONTRACT = '''
Profile Settings 1 1 composition
Settings Forecast 1 0..1 composition
Settings Rate 1 0..* composition
Rate Currency 0..1 1 reference
Settings Currency 0..1 1 reference
Settings Income 0..1 0..1 reference
Account Currency 0..* 1 reference
Goal Currency 0..* 1 reference
Debt Currency 0..* 1 reference
Transaction Account 0..* 1 reference
Transaction Account 0..* 0..1 reference
Transaction Category 0..* 1 reference
Transaction Split 1 0..* composition
Split Category 0..* 1 reference
Transaction Transaction 0..* 0..1 reference
Transaction Debt 0..* 0..1 reference
Debt Account 0..* 1 reference
Adjustment Account 0..* 1 reference
Reconciliation Account 0..* 1 reference
Category Category 0..* 0..1 reference
Budget Category 0..1 1 reference
Budget BudgetVersion 1 0..* composition
Goal GoalVersion 1 0..* composition
Payment PaymentVersion 1 0..* composition
Income IncomeVersion 1 0..* composition
Income IncomeOverride 1 0..* composition
IncomeOverride IncomeVersion 0..* 0..1 reference
Payment Account 0..* 1 reference
Payment Category 0..* 1 reference
PaymentVersion Account 0..* 1 reference
PaymentVersion Category 0..* 1 reference
Income Account 0..* 1 reference
IncomeVersion Account 0..* 1 reference
Transaction Goal 0..* 0..1 reference
Transaction GoalVersion 0..* 0..1 reference
Transaction Payment 0..* 0..1 reference
Transaction PaymentVersion 0..* 0..1 reference
Transaction Income 0..* 0..1 reference
Transaction IncomeVersion 0..* 0..1 reference
Cycle Goal 0..* 1 reference
Cycle Payment 0..* 0..1 reference
Cycle PaymentVersion 0..* 0..1 reference
Cycle Transaction 0..1 0..1 reference
Release Goal 0..* 1 reference
Release Cycle 0..1 0..1 reference
Release Transaction 0..1 1 reference
Scenario Change 1 0..* composition
Scenario Event 1 0..* composition
Event Account 0..* 0..1 reference
Change Goal 0..* 0..1 soft
Change Payment 0..* 0..1 soft
Change Income 0..* 0..1 soft
Change Currency 0..* 0..1 reference
Rule Category 0..* 1 reference
Template Account 0..* 1 reference
Template Account 0..* 0..1 reference
Template Category 0..* 1 reference
Template Currency 0..* 1 reference
Template Currency 0..* 0..1 reference
Template TemplateSplit 1 0..* composition
TemplateSplit Category 0..* 1 reference
Csv Account 0..* 1 reference
Csv Currency 0..* 1 reference
Forecast Account 0..1 0..1 reference
Forecast GoalAssignment 1 0..* composition
Forecast Repayment 1 0..* composition
Forecast Transfer 1 0..* composition
GoalAssignment Goal 0..1 1 reference
GoalAssignment Account 0..* 1 reference
GoalAssignment Account 0..* 1 reference
Repayment Account 0..* 1 reference
Repayment Account 0..1 0..1 reference
Repayment Debt 0..1 0..1 reference
Transfer Account 0..* 1 reference
Transfer Account 0..* 1 reference
'''
ENTITY_CODE = {'Profile': {'codeType': 'LedgerProfile',
             'source': 'src/domain/profiles.ts',
             'keyFields': ['id'],
             'keyScope': None},
 'Settings': {'codeType': 'FinanceState["settings"]',
              'source': 'src/domain/types.ts',
              'keyFields': [],
              'keyScope': 'one FinanceState.settings per profile storage; no profileId property'},
 'Forecast': {'codeType': 'ForecastPreferences',
              'source': 'src/domain/types.ts',
              'keyFields': [],
              'keyScope': 'one settings.forecast per FinanceState; no profileId property'},
 'Currency': {'codeType': '(typeof CURRENCIES)[CurrencyCode]',
              'source': 'src/domain/currency.ts',
              'keyFields': [],
              'keyScope': 'CurrencyCode dictionary key, not a property of CURRENCIES[CurrencyCode]'},
 'Rate': {'codeType': 'ExchangeRate',
          'source': 'src/domain/currency.ts',
          'keyFields': [],
          'keyScope': 'ExchangeSettings.rates dictionary key (CurrencyCode), within profile settings; '
                      'no id/currency/profileId properties'},
 'Account': {'codeType': 'Account',
             'source': 'src/domain/types.ts',
             'keyFields': ['id'],
             'keyScope': None},
 'Category': {'codeType': 'Category',
              'source': 'src/domain/types.ts',
              'keyFields': ['id'],
              'keyScope': None},
 'Transaction': {'codeType': 'Transaction',
                 'source': 'src/domain/types.ts',
                 'keyFields': ['id'],
                 'keyScope': None},
 'Split': {'codeType': 'NonNullable<Transaction["splits"]>[number]',
           'source': 'src/domain/types.ts',
           'keyFields': ['category'],
           'keyScope': 'within one Transaction.splits array'},
 'Debt': {'codeType': 'Debt', 'source': 'src/domain/debts.ts', 'keyFields': ['id'], 'keyScope': None},
 'Adjustment': {'codeType': 'BalanceAdjustment',
                'source': 'src/domain/reconciliation.ts',
                'keyFields': ['id'],
                'keyScope': None},
 'Reconciliation': {'codeType': 'AccountReconciliation',
                    'source': 'src/domain/reconciliation.ts',
                    'keyFields': ['id'],
                    'keyScope': None},
 'Goal': {'codeType': 'Goal', 'source': 'src/domain/types.ts', 'keyFields': ['id'], 'keyScope': None},
 'GoalVersion': {'codeType': 'GoalTermsVersion',
                 'source': 'src/domain/types.ts',
                 'keyFields': ['id'],
                 'keyScope': 'within one Goal.versions array'},
 'Payment': {'codeType': 'Recurring',
             'source': 'src/domain/types.ts',
             'keyFields': ['id'],
             'keyScope': None},
 'PaymentVersion': {'codeType': 'PaymentTermsVersion',
                    'source': 'src/domain/types.ts',
                    'keyFields': ['id'],
                    'keyScope': 'within one Recurring.versions array'},
 'Income': {'codeType': 'PlannedIncome',
            'source': 'src/domain/types.ts',
            'keyFields': ['id'],
            'keyScope': None},
 'IncomeVersion': {'codeType': 'IncomeTermsVersion',
                   'source': 'src/domain/types.ts',
                   'keyFields': ['id'],
                   'keyScope': 'within one PlannedIncome.versions array'},
 'IncomeOverride': {'codeType': 'IncomeOccurrenceOverride',
                    'source': 'src/domain/types.ts',
                    'keyFields': ['versionId', 'occurrenceDate'],
                    'keyScope': 'within one PlannedIncome.occurrenceOverrides array'},
 'Cycle': {'codeType': 'GoalFundCycle',
           'source': 'src/domain/types.ts',
           'keyFields': ['id'],
           'keyScope': None},
 'Release': {'codeType': 'GoalRelease',
             'source': 'src/domain/types.ts',
             'keyFields': ['id'],
             'keyScope': None},
 'Budget': {'codeType': 'BudgetPlan',
            'source': 'src/domain/budgets.ts',
            'keyFields': ['categoryId'],
            'keyScope': None},
 'BudgetVersion': {'codeType': 'BudgetVersion',
                   'source': 'src/domain/budgets.ts',
                   'keyFields': ['id'],
                   'keyScope': 'within one BudgetPlan.versions array'},
 'Scenario': {'codeType': 'SavedScenario',
              'source': 'src/domain/types.ts',
              'keyFields': ['id'],
              'keyScope': None},
 'Change': {'codeType': 'ScenarioChange',
            'source': 'src/domain/types.ts',
            'keyFields': ['source', 'sourceId'],
            'keyScope': 'within one SavedScenario.changes array'},
 'Event': {'codeType': 'ScenarioEvent',
           'source': 'src/domain/types.ts',
           'keyFields': ['id'],
           'keyScope': 'within one SavedScenario.events array'},
 'Rule': {'codeType': 'CategoryRule',
          'source': 'src/domain/automation.ts',
          'keyFields': ['id'],
          'keyScope': None},
 'Template': {'codeType': 'TransactionTemplate',
              'source': 'src/domain/automation.ts',
              'keyFields': ['id'],
              'keyScope': None},
 'TemplateSplit': {'codeType': 'NonNullable<TransactionTemplate["splits"]>[number]',
                   'source': 'src/domain/automation.ts',
                   'keyFields': ['category'],
                   'keyScope': 'within one TransactionTemplate.splits array'},
 'Csv': {'codeType': 'CsvSourceProfile',
         'source': 'src/domain/automation.ts',
         'keyFields': ['id'],
         'keyScope': None},
 'GoalAssignment': {'codeType': 'NonNullable<ForecastPreferences["goalAccounts"]>[number]',
                    'source': 'src/domain/types.ts',
                    'keyFields': ['goalId'],
                    'keyScope': 'within one ForecastPreferences.goalAccounts array'},
 'Repayment': {'codeType': 'NonNullable<ForecastPreferences["repaymentAccounts"]>[number]',
               'source': 'src/domain/types.ts',
               'keyFields': ['kind', 'sourceId'],
               'keyScope': 'within one ForecastPreferences.repaymentAccounts array'},
 'Transfer': {'codeType': 'ForecastTransfer',
              'source': 'src/domain/types.ts',
              'keyFields': ['id'],
              'keyScope': None}}

RELATION_CODE = {'R1': {'codeLabel': 'settings',
        'codePath': 'FinanceState.settings; scoped by LedgerProfile.id through profileStorageKey',
        'optionalProperty': False},
 'R2': {'codeLabel': 'forecast', 'codePath': 'forecast', 'optionalProperty': True},
 'R3': {'codeLabel': 'exchange.rates',
        'codePath': 'exchange.rates[CurrencyCode]',
        'optionalProperty': True},
 'R4': {'codeLabel': 'CurrencyCode',
        'codePath': 'key of ExchangeSettings.rates',
        'optionalProperty': False},
 'R5': {'codeLabel': 'baseCurrency', 'codePath': 'baseCurrency', 'optionalProperty': True},
 'R6': {'codeLabel': 'spendableIncomeId', 'codePath': 'spendableIncomeId', 'optionalProperty': True},
 'R7': {'codeLabel': 'currency', 'codePath': 'currency', 'optionalProperty': True},
 'R8': {'codeLabel': 'currency', 'codePath': 'currency', 'optionalProperty': True},
 'R9': {'codeLabel': 'currency', 'codePath': 'currency', 'optionalProperty': False},
 'R10': {'codeLabel': 'accountId', 'codePath': 'accountId', 'optionalProperty': False},
 'R11': {'codeLabel': 'toAccountId', 'codePath': 'toAccountId', 'optionalProperty': True},
 'R12': {'codeLabel': 'category', 'codePath': 'category', 'optionalProperty': False},
 'R13': {'codeLabel': 'splits', 'codePath': 'splits', 'optionalProperty': True},
 'R14': {'codeLabel': 'category', 'codePath': 'category', 'optionalProperty': False},
 'R15': {'codeLabel': 'refundOf', 'codePath': 'refundOf', 'optionalProperty': True},
 'R16': {'codeLabel': 'debtId', 'codePath': 'debtId', 'optionalProperty': True},
 'R17': {'codeLabel': 'accountId', 'codePath': 'accountId', 'optionalProperty': False},
 'R18': {'codeLabel': 'accountId', 'codePath': 'accountId', 'optionalProperty': False},
 'R19': {'codeLabel': 'accountId', 'codePath': 'accountId', 'optionalProperty': False},
 'R20': {'codeLabel': 'parentId', 'codePath': 'parentId', 'optionalProperty': True},
 'R21': {'codeLabel': 'categoryId', 'codePath': 'categoryId', 'optionalProperty': False},
 'R22': {'codeLabel': 'versions', 'codePath': 'versions', 'optionalProperty': True},
 'R23': {'codeLabel': 'versions', 'codePath': 'versions', 'optionalProperty': True},
 'R24': {'codeLabel': 'versions', 'codePath': 'versions', 'optionalProperty': True},
 'R25': {'codeLabel': 'versions', 'codePath': 'versions', 'optionalProperty': True},
 'R26': {'codeLabel': 'occurrenceOverrides',
         'codePath': 'occurrenceOverrides',
         'optionalProperty': True},
 'R27': {'codeLabel': 'versionId', 'codePath': 'versionId', 'optionalProperty': False},
 'R28': {'codeLabel': 'accountId', 'codePath': 'accountId', 'optionalProperty': False},
 'R29': {'codeLabel': 'category', 'codePath': 'category', 'optionalProperty': False},
 'R30': {'codeLabel': 'accountId', 'codePath': 'accountId', 'optionalProperty': False},
 'R31': {'codeLabel': 'category', 'codePath': 'category', 'optionalProperty': False},
 'R32': {'codeLabel': 'accountId', 'codePath': 'accountId', 'optionalProperty': False},
 'R33': {'codeLabel': 'accountId', 'codePath': 'accountId', 'optionalProperty': False},
 'R34': {'codeLabel': 'goalId', 'codePath': 'goalId', 'optionalProperty': True},
 'R35': {'codeLabel': 'goalVersionId', 'codePath': 'goalVersionId', 'optionalProperty': True},
 'R36': {'codeLabel': 'recurringId', 'codePath': 'recurringId', 'optionalProperty': True},
 'R37': {'codeLabel': 'recurringVersionId', 'codePath': 'recurringVersionId', 'optionalProperty': True},
 'R38': {'codeLabel': 'plannedIncomeId', 'codePath': 'plannedIncomeId', 'optionalProperty': True},
 'R39': {'codeLabel': 'incomeVersionId', 'codePath': 'incomeVersionId', 'optionalProperty': True},
 'R40': {'codeLabel': 'goalId', 'codePath': 'goalId', 'optionalProperty': False},
 'R41': {'codeLabel': 'recurringId', 'codePath': 'recurringId', 'optionalProperty': True},
 'R42': {'codeLabel': 'recurringVersionId', 'codePath': 'recurringVersionId', 'optionalProperty': True},
 'R43': {'codeLabel': 'paymentTransactionId',
         'codePath': 'paymentTransactionId',
         'optionalProperty': True},
 'R44': {'codeLabel': 'goalId', 'codePath': 'goalId', 'optionalProperty': False},
 'R45': {'codeLabel': 'cycleId', 'codePath': 'cycleId', 'optionalProperty': True},
 'R46': {'codeLabel': 'transferId', 'codePath': 'transferId', 'optionalProperty': False},
 'R47': {'codeLabel': 'changes', 'codePath': 'changes', 'optionalProperty': False},
 'R48': {'codeLabel': 'events', 'codePath': 'events', 'optionalProperty': False},
 'R49': {'codeLabel': 'accountId', 'codePath': 'accountId', 'optionalProperty': True},
 'R50': {'codeLabel': 'sourceId',
         'codePath': 'sourceId when source === "goal"',
         'optionalProperty': False},
 'R51': {'codeLabel': 'sourceId',
         'codePath': 'sourceId when source === "payment"',
         'optionalProperty': False},
 'R52': {'codeLabel': 'sourceId',
         'codePath': 'sourceId when source === "income"',
         'optionalProperty': False},
 'R53': {'codeLabel': 'currency', 'codePath': 'currency', 'optionalProperty': True},
 'R54': {'codeLabel': 'category', 'codePath': 'category', 'optionalProperty': False},
 'R55': {'codeLabel': 'accountId', 'codePath': 'accountId', 'optionalProperty': False},
 'R56': {'codeLabel': 'toAccountId', 'codePath': 'toAccountId', 'optionalProperty': True},
 'R57': {'codeLabel': 'category', 'codePath': 'category', 'optionalProperty': False},
 'R58': {'codeLabel': 'currency', 'codePath': 'currency', 'optionalProperty': False},
 'R59': {'codeLabel': 'toCurrency', 'codePath': 'toCurrency', 'optionalProperty': True},
 'R60': {'codeLabel': 'splits', 'codePath': 'splits', 'optionalProperty': True},
 'R61': {'codeLabel': 'category', 'codePath': 'category', 'optionalProperty': False},
 'R62': {'codeLabel': 'options.accountId', 'codePath': 'options.accountId', 'optionalProperty': False},
 'R63': {'codeLabel': 'currency', 'codePath': 'currency', 'optionalProperty': False},
 'R64': {'codeLabel': 'dailyAccountId', 'codePath': 'dailyAccountId', 'optionalProperty': True},
 'R65': {'codeLabel': 'goalAccounts', 'codePath': 'goalAccounts', 'optionalProperty': True},
 'R66': {'codeLabel': 'repaymentAccounts', 'codePath': 'repaymentAccounts', 'optionalProperty': True},
 'R67': {'codeLabel': 'transfers', 'codePath': 'transfers', 'optionalProperty': True},
 'R68': {'codeLabel': 'goalId', 'codePath': 'goalId', 'optionalProperty': False},
 'R69': {'codeLabel': 'fromAccountId', 'codePath': 'fromAccountId', 'optionalProperty': False},
 'R70': {'codeLabel': 'toAccountId', 'codePath': 'toAccountId', 'optionalProperty': False},
 'R71': {'codeLabel': 'accountId', 'codePath': 'accountId', 'optionalProperty': False},
 'R72': {'codeLabel': 'sourceId',
         'codePath': 'sourceId when kind === "credit"',
         'optionalProperty': False},
 'R73': {'codeLabel': 'sourceId',
         'codePath': 'sourceId when kind === "debt"',
         'optionalProperty': False},
 'R74': {'codeLabel': 'accountId', 'codePath': 'accountId', 'optionalProperty': False},
 'R75': {'codeLabel': 'toAccountId', 'codePath': 'toAccountId', 'optionalProperty': False}}


COLLECTIONS = {
    'accounts': 'Account', 'transactions': 'Transaction',
    'categories': 'Category', 'goals': 'Goal',
    'goalFundCycles': 'Cycle', 'goalReleases': 'Release',
    'recurring': 'Payment', 'plannedIncomes': 'Income',
    'scenarios': 'Scenario', 'categoryRules': 'Rule',
    'transactionTemplates': 'Template', 'csvProfiles': 'Csv',
    'balanceAdjustments': 'Adjustment', 'reconciliations': 'Reconciliation',
    'budgetPlans': 'Budget', 'debts': 'Debt',
}


# Resolve the declared diagram types and shown fields with the installed
# TypeScript compiler. The virtual source is in memory; no app files are made.
TYPESCRIPT_AUDIT = r'''
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[1];
const ts = require(path.join(root, 'node_modules/typescript'));
const request = JSON.parse(fs.readFileSync(0, 'utf8'));
const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
const raw = ts.readConfigFile(configPath, ts.sys.readFile);
const config = ts.parseJsonConfigFileContent(raw.config, ts.sys, root);
const options = {...config.options, noEmit: true, skipLibCheck: true};
const files = [...new Set(request.nodes.map(n => path.join(root, n.source)))];
files.push(path.join(root, 'src/domain/recurrence.ts'));
const initial = ts.createProgram(files, options);
const initialChecker = initial.getTypeChecker();
const providers = new Map();
for (const file of files) {
  const source = initial.getSourceFile(file);
  if (!source) throw new Error('Missing source ' + file);
  const symbol = initialChecker.getSymbolAtLocation(source);
  for (const exported of initialChecker.getExportsOfModule(symbol)) {
    if (!providers.has(exported.name)) providers.set(exported.name, file);
  }
}
const queries = [];
const addQuery = text => { const name = 'ER_QUERY_' + queries.length; queries.push({name,text}); return name; };
for (const node of request.nodes) {
  node.query = addQuery(node.codeType);
  for (const field of node.attributes) field.query = addQuery(field.type);
}
const needed = new Set();
const queryText = queries.map(q => `export type ${q.name} = ${q.text};`).join('\n');
const parsed = ts.createSourceFile('queries.ts', queryText, ts.ScriptTarget.Latest, true);
function collect(node) {
  if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && node.typeName.text !== 'NonNullable') needed.add(node.typeName.text);
  if (ts.isTypeQueryNode(node) && ts.isIdentifier(node.exprName)) needed.add(node.exprName.text);
  ts.forEachChild(node, collect);
}
collect(parsed);
const imports = [];
for (const name of needed) {
  if (!providers.has(name)) throw new Error('No exported type/value provider for ' + name);
  imports.push(`import { ${name} } from ${JSON.stringify(providers.get(name).replace(/\.ts$/, ''))};`);
}
const virtual = path.join(root, '__er_diagram_readonly_audit__.ts');
const content = imports.join('\n') + '\n' + queryText;
const host = ts.createCompilerHost(options);
const originalGet = host.getSourceFile.bind(host);
host.getSourceFile = (name, languageVersion, onError, shouldCreateNewSourceFile) => name === virtual
  ? ts.createSourceFile(name, content, languageVersion, true)
  : originalGet(name, languageVersion, onError, shouldCreateNewSourceFile);
const originalRead = host.readFile.bind(host), originalExists = host.fileExists.bind(host);
host.readFile = name => name === virtual ? content : originalRead(name);
host.fileExists = name => name === virtual || originalExists(name);
const program = ts.createProgram([...files, virtual], options, host);
const checker = program.getTypeChecker();
const source = program.getSourceFile(virtual);
const diagnostics = [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source)]
  .map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
const aliases = new Map(source.statements.filter(ts.isTypeAliasDeclaration).map(n => [n.name.text, checker.getTypeFromTypeNode(n.type)]));
function fieldAt(type, name) {
  let property, optionalPath = false;
  for (const part of name.split('.')) {
    property = checker.getPropertyOfType(checker.getNonNullableType(type), part);
    if (!property) return null;
    optionalPath ||= !!(property.flags & ts.SymbolFlags.Optional);
    type = checker.getTypeOfSymbolAtLocation(property, property.valueDeclaration || property.declarations?.[0] || source);
  }
  return {property, type, optionalPath};
}
const results = [];
for (const node of request.nodes) {
  const base = aliases.get(node.query);
  for (const field of node.attributes) {
    const actual = fieldAt(base, field.name);
    const claimed = aliases.get(field.query);
    const optional = actual ? actual.optionalPath : null;
    const actualType = actual?.type || null;
    const actualParts = actualType ? (actualType.isUnion() ? actualType.types : [actualType])
      .filter(part => !optional || !(part.flags & ts.TypeFlags.Undefined)) : [];
    const claimedParts = claimed.isUnion() ? claimed.types : [claimed];
    // Optionality is shown by '?'. Remove only that implicit undefined; null
    // remains a real member of the property type and must stay in the diagram.
    const typeMatches = !!actualType && actualParts.length > 0 &&
      !(actualType.flags & ts.TypeFlags.Any) && !(claimed.flags & ts.TypeFlags.Any) &&
      (!optional || !claimedParts.some(part => part.flags & ts.TypeFlags.Undefined)) &&
      actualParts.every(part => checker.isTypeAssignableTo(part, claimed)) &&
      checker.isTypeAssignableTo(claimed, actualType);
    const declaration = actual?.property.declarations?.find(d => d.type &&
      d.getSourceFile().fileName.startsWith(root + path.sep + 'src' + path.sep));
    const declaredType = declaration?.type?.getText(declaration.getSourceFile()) || null;
    const declaredMatches = !declaredType || declaredType.replace(/\s+/g, '') === field.type.replace(/\s+/g, '');
    results.push({entity: node.id, field: field.name, exists: !!actual,
      actualType: actualType ? actualParts.map(part => checker.typeToString(part, undefined, ts.TypeFormatFlags.NoTruncation)).join(' | ') : null,
      claimedType: field.type, declaredType, declaredMatches, optional, optionalMatches: optional === field.optional, typeMatches});
  }
  for (const relation of node.relations) {
    const actual = fieldAt(base, relation.property);
    const optional = actual ? actual.optionalPath : null;
    results.push({entity: node.id, relation: relation.id, field: relation.property,
      exists: !!actual, optional, optionalMatches: optional === relation.optional});
  }
}
process.stdout.write(JSON.stringify({diagnostics,results}));
'''


def code_checks(model, check):
    nodes = {n['id']: n for n in model['nodes']}
    edges = {e['id']: e for e in model['edges']}
    request = {'nodes': []}
    short_titles = {
        'Settings': 'FinanceState.settings', 'Currency': 'CURRENCIES[CurrencyCode]',
        'Split': 'Transaction.splits[]', 'TemplateSplit': 'TransactionTemplate.splits[]',
        'GoalAssignment': 'ForecastPreferences.goalAccounts[]',
        'Repayment': 'ForecastPreferences.repaymentAccounts[]',
    }
    for identifier, expected in ENTITY_CODE.items():
        node = nodes.get(identifier, {})
        check(f'code:{identifier}:exact TypeScript type',
              node.get('codeType') == expected['codeType'] and node.get('source') == expected['source'])
        check(f'code:{identifier}:visible real type or member path',
              node.get('title') in {expected['codeType'], short_titles.get(identifier)})
        check(f'code:{identifier}:real local key and parent scope',
              node.get('keyFields') == expected['keyFields'] and node.get('keyScope') == expected['keyScope'])
        attributes = node.get('attributes', [])
        names = [a.get('name') for a in attributes]
        check(f'code:{identifier}:typed distinct attributes',
              bool(attributes) and len(names) == len(set(names)) and
              all(isinstance(a.get('name'), str) and a['name'] and
                  isinstance(a.get('type'), str) and a['type'] and
                  isinstance(a.get('optional'), bool) for a in attributes))
        check(f'code:{identifier}:shown key attributes',
              all(key in names for key in expected['keyFields']))
        display_errors = [a['name'] for a in attributes if a.get('displayType') and a['displayType'] != a['type']]
        check(f'code:{identifier}:actual types shown without self-referential substitutions',
              not display_errors, str(display_errors))
        request['nodes'].append({
            'id': identifier, 'source': expected['source'], 'codeType': expected['codeType'],
            'attributes': attributes, 'relations': [],
        })
    requests = {n['id']: n for n in request['nodes']}
    for identifier, expected in RELATION_CODE.items():
        edge = edges.get(identifier, {})
        check(f'code:{identifier}:real relation role and source path',
              edge.get('role') == expected['codeLabel'] and edge.get('codePath') == expected['codePath'])
        # R1 is storage ownership, R4 is a dictionary key. They are deliberately
        # not claimed as stored LedgerProfile.settings or ExchangeRate.currency.
        if identifier not in ('R1', 'R4') and edge.get('source') in requests:
            requests[edge['source']]['relations'].append({
                'id': identifier, 'property': expected['codeLabel'], 'optional': expected['optionalProperty'],
            })
    runtime = Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies'
    node_binary = runtime / 'node/bin/node'
    if not node_binary.exists():
        node_binary = 'node'
    result = subprocess.run([str(node_binary), '-e', TYPESCRIPT_AUDIT, str(REPOSITORY)],
                            input=json.dumps(request), text=True, capture_output=True)
    check('code:TypeScript declarations can be resolved', result.returncode == 0, result.stderr[-3000:])
    if result.returncode:
        return {'resolved': False}
    evidence = json.loads(result.stdout)
    check('code:all declared diagram type expressions resolve without errors',
          not evidence['diagnostics'], str(evidence['diagnostics']))
    for item in evidence['results']:
        label = item.get('relation', item['entity'] + '.' + item['field'])
        check('code:source-property:' + label,
              item['exists'] and item['optionalMatches'] and item.get('typeMatches', True) and item.get('declaredMatches', True),
              json.dumps(item, ensure_ascii=False))
    source_paths = sorted({n['source'] for n in ENTITY_CODE.values()} |
                          {'src/domain/recurrence.ts', 'src/domain/goalFunds.ts',
                           'src/domain/incomes.ts', 'src/domain/accountForecastSettings.ts',
                           'src/infrastructure/storage/profileStorage.ts'})
    return {'resolved': True, 'attributes': sum(len(n['attributes']) for n in request['nodes']),
            'source_sha256': {p: hashlib.sha256((REPOSITORY / p).read_bytes()).hexdigest() for p in source_paths}}


def svg_content_checks(model, check):
    """Measure actual SVG glyphs and check that shown fields are complete.

    The drawing uses Arial at absolute SVG coordinates. Font measurement is
    independent of the renderer's Sharp/Pango wrapping and geometry manifest.
    """
    nodes = {n['id']: n for n in model['nodes']}
    routes = model['geometry']['relationships']
    tiles = model['tiles']
    canvas = {'x': 0, 'y': 0, **model['canvas']}
    epsilon = 0.05
    regular = '/System/Library/Fonts/Supplemental/Arial.ttf'
    bold = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
    font_cache = {}

    def font(size, weight):
        key = (float(size), weight in ('bold', '700'))
        if key not in font_cache:
            font_cache[key] = ImageFont.truetype(bold if key[1] else regular, round(key[0] * 4))
        return font_cache[key]

    def inside(box, area):
        return (box['x'] >= area['x'] - epsilon and box['y'] >= area['y'] - epsilon and
                box['x'] + box['width'] <= area['x'] + area['width'] + epsilon and
                box['y'] + box['height'] <= area['y'] + area['height'] + epsilon)

    def overlaps(a, b):
        return (min(a['x'] + a['width'], b['x'] + b['width']) > max(a['x'], b['x']) + epsilon and
                min(a['y'] + a['height'], b['y'] + b['height']) > max(a['y'], b['y']) + epsilon)

    def segment_intersects(a, b, box):
        lower, upper = 0.0, 1.0
        for axis, coordinate, dimension in [(0, 'x', 'width'), (1, 'y', 'height')]:
            minimum, maximum = box[coordinate], box[coordinate] + box[dimension]
            delta = b[axis] - a[axis]
            if abs(delta) <= epsilon:
                if not minimum < a[axis] < maximum:
                    return False
            else:
                enter, leave = sorted(((minimum - a[axis]) / delta, (maximum - a[axis]) / delta))
                lower, upper = max(lower, enter), min(upper, leave)
                if lower >= upper:
                    return False
        return lower < upper

    def normalized_type(value):
        value = re.sub(r'\s+', ' ', value).strip()
        return re.sub(r'\s*([.\[\]<>|])\s*', r'\1', value)

    def extract(root):
        texts, unknown, notes = [], [], []

        def walk(element, inherited, ownership):
            local = element.tag.rsplit('}', 1)[-1]
            style = dict(inherited)
            style.update(dict(item.split(':', 1) for item in element.get('style', '').split(';') if ':' in item))
            for key in ('font-family', 'font-size', 'font-weight', 'text-anchor', 'fill'):
                if key in element.attrib:
                    style[key] = element.attrib[key]
            owner = dict(ownership)
            for attribute, role in [('data-entity', 'entity'), ('data-edge-label', 'relation'),
                                    ('data-stitch', 'stitch'), ('data-cardinality', 'cardinality')]:
                if attribute in element.attrib:
                    owner[role] = element.attrib[attribute]
            if element.get('data-role') in ('note', 'legend', 'explanation') or element.get('data-note') is not None:
                notes.append(element.attrib)
            rotation = None
            if element.get('transform'):
                match = re.fullmatch(r'rotate\((-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\)', element.get('transform'))
                if local == 'text' and match and float(match[1]) in (-90, 90):
                    rotation = tuple(float(match[i]) for i in (1, 2, 3))
                else:
                    unknown.append('unsupported transform ' + element.get('transform'))
            if local == 'text':
                value = ''.join(element.itertext())
                if list(element):
                    unknown.append('text with nested positioning: ' + value)
                    return
                if 'x' not in element.attrib or 'y' not in element.attrib:
                    unknown.append('text without absolute coordinates: ' + value)
                    return
                size = float(style.get('font-size', 0))
                if not size:
                    unknown.append('text without font size: ' + value)
                    return
                if style.get('font-family', '').split(',')[0].strip(' "\'') != 'Arial':
                    unknown.append('unexpected font family: ' + value)
                f = font(size, style.get('font-weight', 'normal'))
                left, top, right, bottom = (v / 4 for v in f.getbbox(value, anchor='ls'))
                anchor = style.get('text-anchor', 'start')
                advance = f.getlength(value) / 4
                offset = advance / 2 if anchor == 'middle' else advance if anchor == 'end' else 0
                x, y = float(element.get('x')) - offset, float(element.get('y'))
                corners = [(x + dx, y + dy) for dx in (left, right) for dy in (top, bottom)]
                if rotation:
                    angle, cx, cy = rotation
                    direction = 1 if angle == 90 else -1
                    corners = [(cx - direction * (py - cy), cy + direction * (px - cx)) for px, py in corners]
                xs, ys = [p[0] for p in corners], [p[1] for p in corners]
                texts.append({'text': value, 'size': size, 'bold': style.get('font-weight') in ('bold', '700'), 'x': min(xs), 'y': min(ys),
                              'width': max(xs) - min(xs), 'height': max(ys) - min(ys), **owner})
                if not owner:
                    notes.append(value)
            for child in element:
                walk(child, style, owner)

        walk(root, {}, {})
        return texts, unknown, notes

    full_path = ROOT / 'figures/04-er-complete.svg'
    if not full_path.exists():
        check('content:complete SVG available for independent glyph inspection', False)
        return None
    root = ET.parse(full_path).getroot()
    texts, unsupported, notes = extract(root)
    check('content:only entity, relation and continuation text; no notes or legends', not notes, str(notes))
    check('content:all SVG text independently measurable', not unsupported, str(unsupported))
    code_errors, wrap_errors, card_errors = [], [], []
    for node_id, node in nodes.items():
        groups = [g for g in root.iter() if g.get('data-entity') == node_id]
        if len(groups) != 1:
            code_errors.append(node_id + ':missing or duplicate entity group')
            continue
        group = groups[0]
        rect = next((r for r in group if r.tag.endswith('rect')), None)
        if rect is None or any(k not in rect.attrib or abs(float(rect.get(k)) - node[k]) > epsilon for k in ('x', 'y', 'width', 'height')):
            card_errors.append(node_id + ':card bounds differ from model')
        actual_lines = [''.join(t.itertext()) for t in group.iter() if t.tag.endswith('text')]
        expected_lines = node.get('titleLines', []) + [line for field in node.get('fieldLines', []) for line in field['lines']]
        if not expected_lines or actual_lines != expected_lines:
            code_errors.append(node_id + ':SVG text differs from field/title lines')
        if normalized_type(' '.join(node.get('titleLines', []))) != normalized_type(node['title']):
            wrap_errors.append(node_id + ':title identifier split or missing')
        fields = {a['name']: a for a in node['attributes']}
        if Counter(f['field'] for f in node.get('fieldLines', [])) != Counter(fields.keys()):
            code_errors.append(node_id + ':missing or duplicate attribute')
        for field in node.get('fieldLines', []):
            a = fields.get(field['field'])
            expected = f"{a['name']}{'?' if a['optional'] else ''}: {a['type']}" if a else ''
            if normalized_type(' '.join(field['lines'])) != normalized_type(expected):
                wrap_errors.append(node_id + '.' + field['field'] + ':identifier split, substituted or missing')
        for text in (t for t in texts if t.get('entity') == node_id):
            if not inside(text, node):
                card_errors.append(node_id + ':' + text['text'])
    check('content:every real typed attribute is visible once in its entity', not code_errors, str(code_errors))
    check('content:no broken identifiers or self-referential type substitutions', not wrap_errors, str(wrap_errors))
    check('content:actual glyphs and card borders contain all entity text', not card_errors, str(card_errors))
    outside = [t['text'] for t in texts if not inside(t, canvas)]
    check('content:no complete-SVG text clipping', not outside, str(outside))
    text_overlaps = [(a['text'], b['text']) for i, a in enumerate(texts) for b in texts[i + 1:] if overlaps(a, b)]
    check('content:no overlapping text glyph bounds', not text_overlaps, str(text_overlaps))
    under_text = [(r['id'], t['text']) for r in routes for t in texts
                  if not (r['id'] == t.get('relation') and (r.get('label') or {}).get('inline')) and
                  any(segment_intersects(a, b, t) for a, b in zip(r['points'], r['points'][1:]))]
    check('content:no relationship route under unrelated text', not under_text, str(under_text))
    background_errors, hidden_routes = [], []
    for group in (g for g in root.iter() if g.get('data-edge-label')):
        identifier = group.get('data-edge-label')
        rect = next((r for r in group if r.tag.endswith('rect')), None)
        if rect is None or rect.get('fill') not in ('white', '#fff', '#ffffff'):
            background_errors.append(identifier)
            continue
        box = {k: float(rect.get(k)) for k in ('x', 'y', 'width', 'height')}
        if not all(inside(t, box) for t in texts if t.get('relation') == identifier):
            background_errors.append(identifier)
        hidden_routes.extend((identifier, r['id']) for r in routes if r['id'] != identifier and
                             any(segment_intersects(a, b, box) for a, b in zip(r['points'], r['points'][1:])))
    check('content:relationship label backgrounds contain their glyphs', not background_errors, str(background_errors))
    check('content:relationship label backgrounds hide no unrelated lines', not hidden_routes, str(hidden_routes))
    printed_texts = list(texts)
    for tile in tiles:
        tile_root = ET.parse(ROOT / f"figures/04-er-complete-{tile['id']}.svg").getroot()
        tile_texts, unknown, tile_notes = extract(tile_root)
        clipped = [t['text'] for t in tile_texts if overlaps(t, tile) and not inside(t, tile)]
        check(f"content:tile {tile['id']} has no clipped glyphs", not clipped and not unknown, str(clipped + unknown))
        check(f"content:tile {tile['id']} has no notes or legends", not tile_notes, str(tile_notes))
        printed_texts.extend(t for t in tile_texts if inside(t, tile))
    scale = model['layout']['widthMm'] / model['canvas']['width'] / 25.4 * 72
    sizes = [t['size'] * scale for t in printed_texts]
    def category(t):
        return 'titles' if t.get('entity') and t['bold'] else 'fields' if t.get('entity') else 'relationship_and_seam_labels'
    thresholds = {'titles': 9.05, 'fields': 9.99, 'relationship_and_seam_labels': 9.5}
    minima = {kind: min(t['size'] * scale for t in printed_texts if category(t) == kind)
              for kind in thresholds if any(category(t) == kind for t in printed_texts)}
    small = [(t['text'], t['size'] * scale) for t in printed_texts
             if t['size'] * scale < thresholds[category(t)]]
    check('content:print scale keeps fields at 10 pt, labels at 9.5 pt and long titles about 9.1 pt',
          bool(sizes) and not small,
          f"print width={model['layout']['widthMm']} mm; minima={minima}; small={small}")
    return {'actual_text_count': len(texts), 'minimum_font_pt': min(sizes) if sizes else 0,
            'maximum_font_pt': max(sizes) if sizes else 0, 'minimum_font_pt_by_role': minima,
            'print_width_mm': model['layout']['widthMm']}


def svg_marker_checks(root, model, check):
    """Inspect actual crow's-foot primitives independently of route metadata."""
    epsilon = 0.05
    edges = {e['id']: e for e in model['edges']}
    routes = {r['id']: r for r in model['geometry']['relationships']}
    groups = [g for g in root.iter() if g.get('data-cardinality')]
    expected_ids = Counter((identifier, endpoint) for identifier in edges for endpoint in ('source', 'target'))
    check('geometry:all 150 endpoint cardinalities drawn once',
          Counter((g.get('data-cardinality'), g.get('data-endpoint')) for g in groups) == expected_ids)

    def segments(path):
        if re.sub(r'[MLml\d\s.,+\-]', '', path):
            return None
        numbers = [float(n) for n in re.findall(r'-?\d+(?:\.\d+)?', path)]
        if len(numbers) != 4 or not path.startswith('M') or 'L' not in path:
            return None
        return [((numbers[0], numbers[1]), (numbers[2], numbers[3]))]

    def normalized(segment):
        return tuple(sorted(tuple(round(c, 3) for c in point) for point in segment))

    markers, invalid = [], []
    for group in groups:
        identifier, endpoint = group.get('data-cardinality'), group.get('data-endpoint')
        edge, route = edges.get(identifier), routes.get(identifier)
        if not edge or not route or endpoint not in ('source', 'target'):
            invalid.append((identifier, endpoint))
            continue
        side = route['as' if endpoint == 'source' else 'bs']
        point = route['ap' if endpoint == 'source' else 'bp']
        vector = {'left': (-1, 0), 'right': (1, 0), 'top': (0, -1), 'bottom': (0, 1)}[side]
        perpendicular = (-vector[1], vector[0])

        def q(along, across):
            return tuple(point[i] + vector[i] * along + perpendicular[i] * across for i in (0, 1))

        cardinality = edge[endpoint + 'Cardinality']
        expected_lines = [(q(11, 0), q(0, -6)), (q(11, 0), q(0, 6))] if '*' in cardinality else [(q(5, -5), q(5, 5))]
        expected_circles = [(q(16, 0), 3.5)] if cardinality.startswith('0') else []
        if not expected_circles:
            expected_lines.append((q(15, -5), q(15, 5)))
        actual_lines, actual_circles, unsupported = [], [], []
        for shape in group:
            local = shape.tag.rsplit('}', 1)[-1]
            if shape.get('transform') or shape.get('stroke') in (None, 'none', 'white', '#fff', '#ffffff'):
                unsupported.append(shape.attrib)
            if local == 'path':
                result = segments(shape.get('d', ''))
                if result is None:
                    unsupported.append(shape.attrib)
                else:
                    actual_lines.extend(result)
            elif local == 'circle':
                actual_circles.append(((float(shape.get('cx')), float(shape.get('cy'))), float(shape.get('r'))))
            else:
                unsupported.append(shape.attrib)
        circles_match = (len(actual_circles) == len(expected_circles) and
                         all(abs(x - y) <= epsilon for a, b in zip(actual_circles, expected_circles)
                             for x, y in zip((*a[0], a[1]), (*b[0], b[1]))))
        if unsupported or Counter(map(normalized, actual_lines)) != Counter(map(normalized, expected_lines)) or not circles_match:
            invalid.append((identifier, endpoint, cardinality))
        markers.append({'id': identifier, 'endpoint': endpoint, 'lines': actual_lines, 'circles': actual_circles})
    check('geometry:actual endpoint symbols show every declared minimum and maximum', not invalid, str(invalid))

    def point_segment(p, a, b):
        length = sum((b[i] - a[i]) ** 2 for i in (0, 1))
        t = max(0, min(1, sum((p[i] - a[i]) * (b[i] - a[i]) for i in (0, 1)) / length)) if length else 0
        return sum((p[i] - a[i] - t * (b[i] - a[i])) ** 2 for i in (0, 1)) ** 0.5

    def line_distance(first, second):
        a, b = first
        c, d = second
        u, v = (b[0] - a[0], b[1] - a[1]), (d[0] - c[0], d[1] - c[1])
        determinant = u[0] * v[1] - u[1] * v[0]
        if abs(determinant) > 1e-9:
            ac = (c[0] - a[0], c[1] - a[1])
            t = (ac[0] * v[1] - ac[1] * v[0]) / determinant
            s = (ac[0] * u[1] - ac[1] * u[0]) / determinant
            if 0 <= t <= 1 and 0 <= s <= 1:
                return 0
        return min(point_segment(a, c, d), point_segment(b, c, d), point_segment(c, a, b), point_segment(d, a, b))

    def marker_distance(a, b):
        distances = [line_distance(x, y) for x in a['lines'] for y in b['lines']]
        distances += [point_segment(center, *line) - radius for center, radius in a['circles'] for line in b['lines']]
        distances += [point_segment(center, *line) - radius for center, radius in b['circles'] for line in a['lines']]
        distances += [sum((p[i] - q[i]) ** 2 for i in (0, 1)) ** 0.5 - r - s
                      for p, r in a['circles'] for q, s in b['circles']]
        return min(distances, default=float('inf'))

    touching = [(a['id'], a['endpoint'], b['id'], b['endpoint'])
                for i, a in enumerate(markers) for b in markers[i + 1:] if marker_distance(a, b) < 2.5]
    check('geometry:cardinality symbols stay separated, including dense account ports', not touching, str(touching))
    foreign_lines = []
    for marker in markers:
        for identifier, route in routes.items():
            if identifier == marker['id']:
                continue
            lines = list(zip(route['points'], route['points'][1:]))
            foreign = {'lines': lines, 'circles': []}
            if marker_distance(marker, foreign) < 1.5:
                foreign_lines.append((marker['id'], marker['endpoint'], identifier))
    check('geometry:no unrelated route crosses an endpoint cardinality symbol', not foreign_lines, str(foreign_lines))

    labels = [g for g in root.iter() if g.get('data-edge-label')]
    label_counts = Counter(g.get('data-edge-label') for g in labels)
    required = {'R10', 'R11', 'R55', 'R56', 'R58', 'R59', 'R69', 'R70', 'R71', 'R72', 'R74', 'R75'}
    check('geometry:all 12 parallel relationship roles visible once; other labels distinct',
          all(label_counts[identifier] == 1 for identifier in required) and
          all(identifier in edges and count == 1 for identifier, count in label_counts.items()),
          str(dict(label_counts)))
    wrong_labels = [g.get('data-edge-label') for g in labels
                    if ''.join(g.itertext()).strip() != edges.get(g.get('data-edge-label'), {}).get('role')]
    check('geometry:actual SVG relation labels use the declared source-property names', not wrong_labels, str(wrong_labels))




def geometry_checks(model, check):
    """Compare the drawing, seam manifest and each SVG, not only their counts."""
    geometry = model.get('geometry', {})
    tiles = model.get('tiles', [])
    nodes = {node['id']: node for node in model['nodes']}
    relationships = geometry.get('relationships', [])
    crossings = geometry.get('crossings', [])
    edges = {edge['id']: edge for edge in model['edges']}
    epsilon = 0.001

    def within(node, tile):
        return (node['x'] >= tile['x'] - epsilon and
                node['y'] >= tile['y'] - epsilon and
                node['x'] + node['width'] <= tile['x'] + tile['width'] + epsilon and
                node['y'] + node['height'] <= tile['y'] + tile['height'] + epsilon)

    def intersects(a, b):
        return (min(a['x'] + a['width'], b['x'] + b['width']) >
                max(a['x'], b['x']) + epsilon and
                min(a['y'] + a['height'], b['y'] + b['height']) >
                max(a['y'], b['y']) + epsilon)

    def segment_enters_card(a, b, node):
        """Segment/slab clipping, with card borders excluded from its interior."""
        lower, upper = 0, 1
        for axis, coordinate, dimension in [(0, 'x', 'width'), (1, 'y', 'height')]:
            minimum = node[coordinate] + epsilon
            maximum = node[coordinate] + node[dimension] - epsilon
            delta = b[axis] - a[axis]
            if abs(delta) <= epsilon:
                if not minimum < a[axis] < maximum:
                    return False
            else:
                entering, leaving = sorted(((minimum - a[axis]) / delta,
                                            (maximum - a[axis]) / delta))
                lower, upper = max(lower, entering), min(upper, leaving)
                if lower >= upper:
                    return False
        return lower < upper

    canvas = model.get('canvas', {})
    width, height = canvas.get('width', 0), canvas.get('height', 0)
    print_width = model.get('layout', {}).get('widthMm', 0)
    ordered = sorted(tiles, key=lambda t: t['y'])
    layout_ok = (len(tiles) in (2, 3) and {t['id'] for t in tiles} == {str(i + 1) for i in range(len(tiles))} and
                 all(t['x'] == 0 and t['width'] == width and width > 0 and t['height'] > 0 for t in tiles) and
                 ordered[0]['y'] == 0 and
                 all(b['y'] == a['y'] + a['height'] for a, b in zip(ordered, ordered[1:])) and
                 ordered[-1]['y'] + ordered[-1]['height'] == height)
    check('geometry:two or three adjacent A4 fragments cover the complete canvas', layout_ok)
    check('geometry:equal scale fits portrait A4 print areas',
          0 < print_width <= 160 and width > 0 and
          all(t['height'] * print_width / width <= (225 if i == 0 else 240) for i, t in enumerate(ordered)))
    seams = [tile['y'] for tile in ordered[1:]]
    assignments = {node_id: [t['id'] for t in tiles if within(node, t)]
                   for node_id, node in nodes.items()}
    check('geometry:all 33 entities wholly within exactly one tile',
          all(len(t) == 1 for t in assignments.values()),
          str({n: t for n, t in assignments.items() if len(t) != 1}))
    check('geometry:tile node manifests agree with bounding boxes',
          all(set(t['nodes']) == {n for n, assigned in assignments.items()
                                  if t['id'] in assigned} for t in tiles))
    node_list = list(nodes.values())
    overlap = [(a['id'], b['id']) for i, a in enumerate(node_list)
               for b in node_list[i + 1:] if intersects(a, b)]
    check('geometry:no overlapping entity cards', not overlap, str(overlap))
    check('geometry:all 75 relationships have one route',
          Counter(r['id'] for r in relationships) == Counter(edges.keys()))
    endpoint_errors = []
    for route in relationships:
        edge = edges.get(route['id'])
        if not edge:
            endpoint_errors.append(route['id'])
            continue
        points = route['points']
        if len(points) < 2 or points[0] != route['ap'] or points[-1] != route['bp']:
            endpoint_errors.append(route['id'])
        for point, side, node in [(route['ap'], route['as'], nodes[edge['source']]),
                                  (route['bp'], route['bs'], nodes[edge['target']])]:
            if side in ('left', 'right'):
                expected = node['x'] + (node['width'] if side == 'right' else 0)
                ok = abs(point[0] - expected) <= epsilon and node['y'] <= point[1] <= node['y'] + node['height']
            elif side in ('top', 'bottom'):
                expected = node['y'] + (node['height'] if side == 'bottom' else 0)
                ok = abs(point[1] - expected) <= epsilon and node['x'] <= point[0] <= node['x'] + node['width']
            else:
                ok = False
            if not ok:
                endpoint_errors.append(route['id'])
    check('geometry:route endpoints attach to their declared entity borders',
          not endpoint_errors, str(endpoint_errors))
    check('geometry:all route coordinates inside assembled canvas',
          all(0 <= x <= width and 0 <= y <= height for r in relationships for x, y in r['points']))
    through_cards = [(r['id'], n['id']) for r in relationships for n in node_list
                     if any(segment_enters_card(a, b, n)
                            for a, b in zip(r['points'], r['points'][1:]))]
    check('geometry:no relationship line passes through an entity card',
          not through_cards, str(through_cards))

    # Seams lie between routing-grid coordinates. Derive actual intersections
    # independently from each route rather than trusting declared stitch totals.
    actual = []
    for route in relationships:
        for a, b in zip(route['points'], route['points'][1:]):
            for axis, boundary in [(1, seam) for seam in seams]:
                if min(a[axis], b[axis]) < boundary < max(a[axis], b[axis]):
                    fraction = (boundary - a[axis]) / (b[axis] - a[axis])
                    point = tuple(round(a[k] + fraction * (b[k] - a[k]), 6) for k in (0, 1))
                    actual.append((route['id'], axis, point))
    declared = [(c['edgeId'], c['axis'], tuple(round(v, 6) for v in c['point']))
                for c in crossings]
    check('geometry:every crossed seam has exactly one manifest entry',
          Counter(actual) == Counter(declared),
          f'route crossings={len(actual)}; manifest crossings={len(declared)}')
    check('geometry:stitch IDs unique', len({c['id'] for c in crossings}) == len(crossings))

    tile_by_id = {t['id']: t for t in tiles}
    adjacency_errors = []
    for crossing in crossings:
        pair = crossing['tiles']
        if len(set(pair)) != 2 or not all(i in tile_by_id for i in pair):
            adjacency_errors.append(crossing['id'])
            continue
        a, b = sorted([tile_by_id[i] for i in pair], key=lambda t: t['y'])
        ok = (crossing['axis'] == 1 and a['y'] + a['height'] == b['y'] and
              abs(crossing['point'][1] - b['y']) <= epsilon and
              0 <= crossing['point'][0] <= width)
        if not ok:
            adjacency_errors.append(crossing['id'])
    check('geometry:stitches join adjacent tiles on the shared boundary',
          not adjacency_errors, str(adjacency_errors))

    full_svg = ROOT / 'figures/04-er-complete.svg'
    check('geometry:complete SVG exists', full_svg.exists())
    hashes = {}

    def shared_svg_groups(root):
        def fingerprint(element):
            return (element.tag, tuple(sorted(element.attrib.items())), element.text or '',
                    tuple(fingerprint(child) for child in element))
        return Counter(fingerprint(g) for g in root.iter()
                       if any(g.get(attribute) for attribute in
                              ('data-entity', 'data-relation', 'data-cardinality', 'data-edge-label')))

    complete_groups = Counter()
    if full_svg.exists():
        tree = ET.parse(full_svg)
        complete_groups = shared_svg_groups(tree.getroot())
        route_groups = [g for g in tree.iter() if g.get('data-source') and g.get('data-relation')]
        check('geometry:75 visible SVG relationship groups',
              Counter(g.get('data-relation') for g in route_groups) == Counter(edges.keys()))
        metadata_errors = [g.get('data-relation') for g in route_groups
                           if any(g.get(attribute) != edges.get(g.get('data-relation'), {}).get(field)
                                  for attribute, field in [('data-source', 'source'), ('data-target', 'target'), ('data-role', 'role')])]
        check('geometry:SVG relationships use the real source, target and role', not metadata_errors, str(metadata_errors))
        check('geometry:all SVG relationship groups contain a visible line',
              all(any(p.tag.endswith('path') and p.get('d') and
                      p.get('stroke') not in (None, 'none', 'white', '#fff', '#ffffff')
                      for p in g) for g in route_groups))
        check('geometry:all 33 entity cards in complete SVG',
              Counter(g.get('data-entity') for g in tree.iter() if g.get('data-entity')) == Counter(nodes.keys()))
        route_by_id = {r['id']: r for r in relationships}
        path_errors, dash_errors = [], []
        for group in route_groups:
            path = next((p for p in group if p.tag.endswith('path') and
                         p.get('stroke') not in (None, 'none', 'white', '#fff', '#ffffff')), None)
            actual_points = [float(n) for n in re.findall(r'-?\d+(?:\.\d+)?', path.get('d', ''))] if path is not None else []
            expected_points = [n for p in route_by_id.get(group.get('data-relation'), {}).get('points', []) for n in p]
            if (len(actual_points) != len(expected_points) or
                    any(abs(a - b) > epsilon for a, b in zip(actual_points, expected_points))):
                path_errors.append(group.get('data-relation'))
            edge = edges.get(group.get('data-relation'), {})
            if path is None or bool(path.get('stroke-dasharray')) != (edge.get('kind') == 'soft'):
                dash_errors.append(group.get('data-relation'))
        check('geometry:actual SVG routes agree with geometry manifest',
              not path_errors, str(path_errors))
        check('geometry:only the three soft references use dashed routes', not dash_errors, str(dash_errors))
        svg_marker_checks(tree.getroot(), model, check)
        hashes[full_svg.name] = hashlib.sha256(full_svg.read_bytes()).hexdigest()

    port_counts = Counter()
    for tile in tiles:
        svg = ROOT / f"figures/04-er-complete-{tile['id']}.svg"
        check(f"geometry:tile {tile['id']} SVG exists", svg.exists())
        if not svg.exists():
            continue
        root = ET.parse(svg).getroot()
        check(f"geometry:tile {tile['id']} contains unchanged entities, routes, endpoint marks and labels",
              bool(complete_groups) and shared_svg_groups(root) == complete_groups)
        view_box = [float(v) for v in root.get('viewBox', '').split()]
        check(f"geometry:tile {tile['id']} exact crop and scale",
              view_box == [tile[k] for k in ('x', 'y', 'width', 'height')])
        ports = [g for g in root.iter() if g.get('data-stitch')]
        expected = {c['id']: c for c in crossings if tile['id'] in c['tiles']}
        check(f"geometry:tile {tile['id']} all expected stitch labels drawn once",
              Counter(g.get('data-stitch') for g in ports) == Counter(expected.keys()))
        errors, hidden_routes = [], []
        port_boxes = []
        for port in ports:
            identifier = port.get('data-stitch')
            port_counts[identifier] += 1
            c = expected.get(identifier)
            neighbor = next((n for n in c['tiles'] if n != tile['id']), None) if c else None
            label_text = ' '.join(''.join(t.itertext()) for t in port if t.tag.endswith('text'))
            if (not c or port.get('data-edge') != c['edgeId'] or port.get('data-tile') != tile['id'] or
                    port.get('data-neighbor') != neighbor or label_text.strip() != identifier.removeprefix('L')):
                errors.append(identifier)
            rect = next((r for r in port if r.tag.endswith('rect')), None)
            if rect is not None:
                box = {k: float(rect.get(k)) for k in ('x', 'y', 'width', 'height')}
                port_boxes.append({'id': identifier, **box})
                if not within(box, tile):
                    errors.append(identifier + ':outside tile')
                if c and (abs(box['x'] + box['width'] / 2 - c['point'][0]) > epsilon or
                          min(abs(box['y'] - c['point'][1]),
                              abs(box['y'] + box['height'] - c['point'][1])) > 4):
                    errors.append(identifier + ':not aligned with actual seam crossing')
                if c:
                    hidden_routes.extend((identifier, r['id']) for r in relationships if r['id'] != c['edgeId'] and
                                         any(segment_enters_card(a, b, box) for a, b in zip(r['points'], r['points'][1:])))
            else:
                errors.append(identifier + ':missing label background')
        check(f"geometry:tile {tile['id']} stitch direction, text and bounds",
              not errors, str(errors))
        port_overlaps = [(a['id'], b['id']) for i, a in enumerate(port_boxes)
                         for b in port_boxes[i + 1:] if intersects(a, b)]
        card_overlaps = [(p['id'], n['id']) for p in port_boxes for n in node_list
                         if intersects(p, n)]
        check(f"geometry:tile {tile['id']} stitch boxes do not overlap each other or entity cards",
              not port_overlaps and not card_overlaps,
              f'ports={port_overlaps}; cards={card_overlaps}')
        check(f"geometry:tile {tile['id']} stitch backgrounds hide no unrelated routes", not hidden_routes, str(hidden_routes))
        hashes[svg.name] = hashlib.sha256(svg.read_bytes()).hexdigest()
    check('geometry:each seam label has exactly two drawn ends',
          port_counts == Counter({c['id']: 2 for c in crossings}), str(dict(port_counts)))
    content = svg_content_checks(model, check)
    return {'tiles': len(tiles), 'relationships': len(relationships),
            'stitches': len(crossings), 'svg_sha256': hashes, 'content': content}



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    parser.add_argument('--require-geometry', action='store_true',
                        help='Fail if final A4 drawing geometry is not yet available')
    args = parser.parse_args()
    model = json.loads(MODEL.read_text())
    nodes = {node['id']: node for node in model['nodes']}
    edges = {edge['id']: edge for edge in model['edges']}
    checks = []

    def check(name, ok, detail=''):
        checks.append({'name': name, 'passed': bool(ok), 'detail': detail})

    check('33 distinct entity/configuration/value-record nodes',
          len(model['nodes']) == len(nodes) == 33 and set(nodes) == set(ENTITY_CODE))
    check('75 distinct relationships', len(model['edges']) == len(edges) == 75)
    for index, row in enumerate(CONTRACT.strip().splitlines(), 1):
        expected = row.split()
        edge = edges.get(f'R{index}', {})
        actual = [edge.get(k) for k in
                  ['source', 'target', 'sourceCardinality', 'targetCardinality', 'kind']]
        check(f'relationship:R{index}', actual == expected,
              f'actual={actual}; expected={expected}')

    source = (REPOSITORY / 'src/domain/types.ts').read_text()
    finance_state = source.split('export interface FinanceState {', 1)[1].split('  settings:', 1)[0]
    actual_collections = set(re.findall(r'^  (\w+)\??: \w+\[\];', finance_state, re.M))
    check('all 16 FinanceState collections covered',
          actual_collections == set(COLLECTIONS) and
          all(n in nodes for n in COLLECTIONS.values()),
          ', '.join(sorted(actual_collections)))
    check('goal stores initial rather than computed savings',
          any(a.get('name') == 'initialSaved' and a.get('type') == 'number'
              for a in nodes.get('Goal', {}).get('attributes', [])))
    check('three optional soft polymorphic scenario source links',
          {e['target'] for e in edges.values() if e['kind'] == 'soft'} ==
          {'Goal', 'Payment', 'Income'} and
          all(e['source'] == 'Change' and e['targetCardinality'] == '0..1'
              for e in edges.values() if e['kind'] == 'soft'))
    check('no invented actual-to-planned transfer FK',
          not any({e['source'], e['target']} == {'Transaction', 'Transfer'}
                  for e in edges.values()))
    check('no invented direct transaction-currency FK',
          not any({e['source'], e['target']} == {'Transaction', 'Currency'}
                  for e in edges.values()))
    check('no single savings account assigned directly to goal',
          not any({e['source'], e['target']} == {'Goal', 'Account'}
                  for e in edges.values()))
    check('no invented balance baseline relationship',
          not any('baseline' in str(e).lower() for e in edges.values()))

    code = code_checks(model, check)
    geometry = None
    if model.get('geometry'):
        geometry = geometry_checks(model, check)
    elif args.require_geometry:
        check('geometry:final A4 drawing geometry available', False)
    report = {
        'scope': 'Independent documentation-model audit; no app tests executed',
        'model_sha256': hashlib.sha256(MODEL.read_bytes()).hexdigest(),
        'checks': checks,
        'passed': sum(c['passed'] for c in checks),
        'total': len(checks),
        'geometry': geometry,
        'code': code,
        'visual_review': {'required': True},
    }
    previous = json.loads(args.output.read_text()) if args.output.exists() else {}
    if (previous.get('model_sha256') == report['model_sha256'] and
            previous.get('geometry') == report['geometry'] and
            previous.get('code') == report['code']):
        report['visual_review'] = previous.get('visual_review', {'required': True})
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(f"{report['passed']}/{report['total']} ER contracts passed")
    for c in checks:
        if not c['passed']:
            print('FAIL', c['name'], c['detail'])
    return 0 if all(c['passed'] for c in checks) else 1


if __name__ == '__main__':
    raise SystemExit(main())
