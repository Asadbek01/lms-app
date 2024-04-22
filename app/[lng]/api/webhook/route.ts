/* eslint-disable camelcase */
import { sendNotification } from '@/actions/notification.action'
import { createUser, updateUser } from '@/actions/user.action'
import { WebhookEvent } from '@clerk/nextjs/server'
import { Webhook } from 'svix'
import { headers } from 'next/headers'

export async function POST(req: Request) {
	const WEBHOOK_SECRET = process.env.NEXT_CLERK_WEBHOOK_SECRET

	if (!WEBHOOK_SECRET) {
		throw new Error(
			'Please add WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local'
		)
	}

	// Get the headers
	const headerPayload = headers()
	const svix_id = headerPayload.get('svix-id')
	const svix_timestamp = headerPayload.get('svix-timestamp')
	const svix_signature = headerPayload.get('svix-signature')

	// If there are no headers, error out
	if (!svix_id || !svix_timestamp || !svix_signature) {
		return new Response('Error occurred -- no svix headers', {
			status: 400,
		})
	}

	const payload = await req.json()
	const body = JSON.stringify(payload)

	const wh = new Webhook(WEBHOOK_SECRET)

	let evt: WebhookEvent

	try {
		evt = wh.verify(body, {
			'svix-id': svix_id,
			'svix-timestamp': svix_timestamp,
			'svix-signature': svix_signature,
		}) as WebhookEvent
	} catch (err) {
		console.error('Error verifying webhook:', err)
		return new Response('Error occured', {
			status: 400,
		})
	}
	// Get the ID and type
	const { id } = evt.data
	const eventType = evt.type

	console.log(`Webhook with and ID of ${id} and type of ${eventType}`)
	console.log('Webhook body:', body)

	if (eventType === 'user.created') {
		const { id, email_addresses, image_url, first_name, last_name } = evt.data

		const user = await createUser({
			clerkId: id,
			email: email_addresses[0].email_address,
			fullName: `${first_name} ${last_name}`,
			picture: image_url,
		})

		await sendNotification(id, 'messageWelcome')

		return new Response(JSON.stringify({ message: 'OK', user }), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
			},
		})
	}

	if (eventType === 'user.updated') {
		const { id, email_addresses, image_url, first_name, last_name } = evt.data

		const user = await updateUser({
			clerkId: id,
			updatedData: {
				email: email_addresses[0].email_address,
				fullName: `${first_name} ${last_name}`,
				picture: image_url,
			},
		})

		await sendNotification(id, 'messageProfileUpdated')

		return new Response(JSON.stringify({ message: 'OK', user }), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
			},
		})
	}

	return new Response('Unhandled event type', {
		status: 400,
	})
}
