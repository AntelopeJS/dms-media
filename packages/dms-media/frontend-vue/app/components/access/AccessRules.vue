<script setup lang="ts">
import type { AccessSubjects, AclEntry, LabelledAclEntry, MediaRight } from '../../types/media'

const props = defineProps<{
	entries: LabelledAclEntry[]
	canEdit: boolean
	subjects: AccessSubjects | null
}>()
const emit = defineEmits<{ change: [AclEntry[]] }>()
const { t } = useI18n()
const RIGHTS: MediaRight[] = ['read', 'write', 'manage']
const RIGHT_RANK: Record<MediaRight, number> = { read: 0, write: 1, manage: 2 }
const subjectFilter = ref('')

function highestRight(entry: AclEntry): MediaRight | undefined {
	return [...entry.rights].sort((left, right) => RIGHT_RANK[right] - RIGHT_RANK[left])[0]
}

function state(entry: AclEntry, right: MediaRight): 'granted' | 'implied' | 'none' {
	const highest = highestRight(entry)
	if (!highest) return 'none'
	if (highest === right) return 'granted'
	return RIGHT_RANK[highest] > RIGHT_RANK[right] ? 'implied' : 'none'
}

function setRight(index: number, right: MediaRight): void {
	const next = props.entries.map(({ subject, rights }) => ({ subject, rights }))
	const entry = next[index]
	if (!entry) return
	entry.rights = state(entry, right) === 'granted' ? RIGHTS.filter((candidate) => RIGHT_RANK[candidate] < RIGHT_RANK[right]).slice(-1) : [right]
	emit('change', next.filter((item) => item.rights.length > 0))
}

function removeEntry(index: number): void {
	emit('change', props.entries.filter((_, position) => position !== index).map(({ subject, rights }) => ({ subject, rights })))
}

const addItems = computed(() => {
	const taken = new Set(props.entries.map((entry) => `${entry.subject.kind}:${entry.subject.id}`))
	const needle = subjectFilter.value.trim().toLowerCase()
	const matches = (text: string) => !needle || text.toLowerCase().includes(needle)
	const roles = (props.subjects?.roles ?? [])
		.filter((role) => !taken.has(`role:${role.id}`) && matches(role.name))
		.map((role) => ({ label: role.name, icon: 'i-ph-users-three', onSelect: () => add({ kind: 'role', id: role.id }) }))
	const permissions = [...(props.subjects?.permissions ?? [])]
		.sort((left, right) => Number(right.id.startsWith('media.')) - Number(left.id.startsWith('media.')))
		.filter((permission) => !taken.has(`permission:${permission.id}`) && (matches(permission.id) || matches(t(permission.title.replace(/^\$/, '')))))
		.slice(0, 40)
		.map((permission) => ({ label: permission.id, icon: 'i-ph-key', onSelect: () => add({ kind: 'permission', id: permission.id }) }))
	return [
		[{ label: t('dms_media.access.roles'), type: 'label' as const }, ...roles],
		[{ label: t('dms_media.access.permissions'), type: 'label' as const }, ...permissions],
	]
})

function add(subject: AclEntry['subject']): void {
	emit('change', [...props.entries.map(({ subject: existing, rights }) => ({ subject: existing, rights })), { subject, rights: ['read'] }])
}

function subjectLabel(entry: LabelledAclEntry): string {
	return entry.label?.startsWith('$') ? t(entry.label.slice(1)) : (entry.label ?? entry.subject.id)
}
</script>

<template>
	<div class="flex flex-col">
		<table class="w-full text-[13px]">
			<thead class="text-dimmed border-default border-b font-mono text-[11px] tracking-wider uppercase">
				<tr>
					<th class="px-4 py-2 text-start font-medium">{{ t('dms_media.access.who') }}</th>
					<th v-for="right in RIGHTS" :key="right" class="w-24 py-2 text-center font-medium">{{ t(`dms_media.rights.${right}`) }}</th>
					<th class="w-12" />
				</tr>
			</thead>
			<tbody>
				<tr v-for="(entry, index) in entries" :key="`${entry.subject.kind}:${entry.subject.id}`" class="border-default border-b">
					<td class="px-4 py-2.5">
						<div class="flex items-center gap-3">
							<DmsIconWell :icon="entry.subject.kind === 'role' ? 'i-ph-users-three' : 'i-ph-key'" tone="muted" size="sm" />
							<div class="min-w-0">
								<p class="text-highlighted truncate font-medium">{{ subjectLabel(entry) }}</p>
								<p class="text-dimmed truncate font-mono text-[11px]">
									{{ entry.subject.kind === 'role' ? t('dms_media.access.role_members', { count: entry.memberCount ?? 0 }) : t('dms_media.access.permission_id', { id: entry.subject.id }) }}
								</p>
							</div>
						</div>
					</td>
					<td v-for="right in RIGHTS" :key="right" class="text-center">
						<UCheckbox
							:model-value="state(entry, right) !== 'none'"
							:disabled="!canEdit"
							:class="state(entry, right) === 'implied' && 'opacity-60'"
							:aria-label="t('dms_media.access.grant', { right: t(`dms_media.rights.${right}`), who: subjectLabel(entry) })"
							class="inline-flex justify-center"
							@update:model-value="setRight(index, right)"
						/>
					</td>
					<td class="pe-3 text-end">
						<UButton v-if="canEdit" icon="i-ph-x" color="neutral" variant="ghost" size="xs" square :aria-label="t('dms_media.access.remove', { who: subjectLabel(entry) })" @click="removeEntry(index)" />
					</td>
				</tr>
				<tr v-if="entries.length === 0">
					<td colspan="5" class="text-muted px-4 py-4">{{ t('dms_media.access.no_rules') }}</td>
				</tr>
			</tbody>
		</table>
		<div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
			<UDropdownMenu v-if="canEdit" :items="addItems" :content="{ align: 'start' }" :ui="{ content: 'max-h-80 w-72' }">
				<UButton icon="i-ph-plus" color="neutral" variant="outline" size="sm" :label="t('dms_media.access.add')" />
				<template #content-top>
					<div class="p-1">
						<UInput v-model="subjectFilter" size="sm" icon="i-ph-magnifying-glass" :placeholder="t('dms_media.access.find_subject')" class="w-full" @keydown.stop />
					</div>
				</template>
			</UDropdownMenu>
			<span class="text-dimmed text-[12px]">{{ t('dms_media.access.implied') }}</span>
		</div>
	</div>
</template>
