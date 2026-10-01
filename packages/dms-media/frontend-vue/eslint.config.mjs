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
]
