import pandas as pd

df = pd.read_csv('clean_flights.csv')


airports_origin = df[['ORIGIN', 'latitude', 'longitude']].rename(columns={'ORIGIN': 'airport'})
airports_dest = df[['DEST', 'latitude_dest', 'longitude_dest']].rename(columns={'DEST': 'airport', 'latitude_dest': 'latitude', 'longitude_dest': 'longitude'})

airports = pd.concat([airports_origin, airports_dest]).drop_duplicates(subset=['airport']).reset_index(drop=True)
airports_csv = "airports.csv"
airports.to_csv(airports_csv, index=False)
print(f"Airports information saved to {airports_csv}")

routes = df[['ORIGIN', 'DEST']].drop_duplicates().reset_index(drop=True)
routes_csv = "routes.csv"
routes.to_csv(routes_csv, index=False)
print(f"Routes information saved to {routes_csv}")


