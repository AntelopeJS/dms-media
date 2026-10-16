// What the renderer imports of Inertia, which a server render of a component
// does not reach: the browser's page, links and visits.
export const Link = {}
export const router = {
	visit: () => undefined,
	on: () => () => undefined,
}
export const usePage = () => ({ url: undefined })
