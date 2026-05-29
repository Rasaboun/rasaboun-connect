export type places = {
	id: string;
	name: string;
	embedded_type: string;
  };
  
export  type journey = {
	duration: number
	departure_date_time: string
	arrival_date_time: string
	sections: section[]
	type: string
	nb_transfers: number
	co2_emission: { value: number }
}

export type display_information = {
	label: string
	color: string
	commercial_mode: string
	direction: string
	headsign: string
}

export type section = {
	type: string
	duration: number
	display_informations?: display_information
	id: string
	to: to
	from: to
	stop_date_times: stop_date_times[]
}
export type stop_date_times = {
	stop_point: { name: string }
}
export type to = {
	name: string
	stop_area: { name: string }
}

export type itineraireProps = {
	place: places
	placesecond: places
}