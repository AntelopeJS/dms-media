import antiSlop from '@antelopejs/tooling-configs/oxc/anti-slop'
import guardrails from '@antelopejs/tooling-configs/oxc/guardrails'
import vue from 'eslint-plugin-vue'
import typescript from '@typescript-eslint/parser'

export default [
	{ ignores: ['node_modules/**', 'dist/**'] },
	...vue.configs['flat/essential'],
	{
		files: ['**/*.ts'],
		languageOptions: { parser: typescript },
	},
	{
		files: ['**/*.vue'],
		languageOptions: { parserOptions: { parser: typescript } },
		rules: { 'vue/multi-word-component-names': 'off' },
	},
	{
		files: ['tests/**/*.ts'],
		plugins: { antelopejs: guardrails, 'anti-slop': antiSlop },
		rules: {
			'antelopejs/no-fs-read-in-tests': 'error',
			'antelopejs/no-constant-value-assertion': 'error',
			'antelopejs/no-typeof-function-only-test': 'error',
			'antelopejs/no-self-import-in-tests': 'error',
			'anti-slop/no-module-mocking': 'error',
		},
	},
]
