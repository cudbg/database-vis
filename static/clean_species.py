import pandas as pd

df = pd.read_csv('species.csv')

df.rename(columns={'order': 'morder'}, inplace=True)

df = df[['morder', 'family', 'genus', 'specificEpithet', 'mainCommonName']]

orders = df['morder'].unique()
selected_orders = orders[:3]

df_selected_orders = df[df['morder'].isin(selected_orders)]

selected_families = []
for order in selected_orders:
    families_in_order = df_selected_orders[df_selected_orders['morder'] == order]['family'].unique()
    selected_families += list(families_in_order[:5])

df_selected_families = df_selected_orders[df_selected_orders['family'].isin(selected_families)]

final_selected_genus = []
for family in selected_families:
    genera_in_family = df_selected_families[df_selected_families['family'] == family]['genus'].unique()
    final_selected_genus += list(genera_in_family[:3])


final_df = df_selected_families[df_selected_families['genus'].isin(final_selected_genus)]

final_df.to_csv('clean_species.csv', index=False)
