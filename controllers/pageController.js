const csv = require("csv-parser");
const fs = require("fs");
const axios = require("axios");
const hubspotBaseUrl = "https://api.hubapi.com";
const hubspotApiKey = process.env.HUBSPOT_API_KEY;

// Vista principal
const vistaPrincipal = (req, res) => {
  res.render("index");
};

// Verificar si el contacto ya existe en HubSpot por email o cédula
const verificarContactoExistente = async (email, contactId) => {
  try {
    const response = await axios.post(
      `${hubspotBaseUrl}/crm/v3/objects/contacts/search`,
      {
        // Se buscan coincidencias por email o por ID
        filterGroups: [
          {
            filters: [
              {
                propertyName: "email",
                operator: "EQ",
                value: email,
              },
            ],
          },
          {
            filters: [
              {
                propertyName: "contact_id",
                operator: "EQ",
                value: contactId,
              },
            ],
          },
        ],
        properties: ["email", "contact_id"],
      },
      { headers: { Authorization: `Bearer ${hubspotApiKey}` } }
    );
    return response.data.results.length > 0 ? response.data.results[0] : null;
  } catch (error) {
    console.error(
      "Error verificando el contacto:",
      error.response?.data || error.message
    );
    return null;
  }
};

// Actualizar un contacto existente
const actualizarContacto = async (contactId, updatedProperties) => {
  try {
    await axios.patch(
      `${hubspotBaseUrl}/crm/v3/objects/contacts/${contactId}`,
      { properties: updatedProperties },
      { headers: { Authorization: `Bearer ${hubspotApiKey}` } }
    );
    console.log(`Contacto ${contactId} actualizado.`);
  } catch (error) {
    console.error(
      "Error actualizando el contacto:",
      error.response?.data || error.message
    );
  }
};

// Asociar un contacto con un negocio
const asociarContactoConNegocio = async (contactId, dealId) => {
  try {
    await axios.put(
      `${hubspotBaseUrl}/crm/v4/objects/contact/${contactId}/associations/default/deal/${dealId}`,
      null,
      {
        headers: {
          Authorization: `Bearer ${hubspotApiKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log(
      `Asociación creada: Contacto ${contactId} con Negocio ${dealId}`
    );
  } catch (error) {
    console.error(
      "Error asociando contacto con negocio:",
      error.response?.data || error.message
    );
    throw error;
  }
};

// Procesar el archivo CSV
const subirArchivo = async (req, res) => {
  if (!req.files || !req.files.csvFile) {
    return res.status(400).send("No se envió ningún archivo.");
  }

  const csvFile = req.files.csvFile;
  const contacts = []; // Lista para guardar los contactos
  const deals = []; // Lista para guardar los negocios
  const filePath = "./uploads/data.csv";

  // Encabezados obligatorios que debe tener el archivo CSV
  const requiredHeaders = [
    "contact_email",
    "contact_name",
    "contact_lastname",
    "contact_phone",
    "contact_id",
    "deal_name",
    "deal_amount",
    "deal_stage",
  ];

  try {
    // Guardar el archivo en el servidor
    await csvFile.mv(filePath);
    // Validar que el archivo tenga los encabezados esperados
    const headersValid = await new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath).pipe(csv());
      stream.on("headers", (headers) => {
        const isValid = requiredHeaders.every((header) =>
          headers.includes(header)
        );
        stream.destroy();
        resolve(isValid);
      });
      stream.on("error", (err) => reject(err));
    });

    if (!headersValid) {
      throw new Error("El archivo no tiene el formato esperado.");
    }

    // Leer y procesar el contenido del archivo CSV
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (row) => {
          // Guardar los datos del contacto
          if (row.contact_email && row.contact_name) {
            contacts.push({
              email: row.contact_email,
              firstname: row.contact_name,
              lastname: row.contact_lastname || "",
              phone: row.contact_phone || "",
              contact_id: row.contact_id || "",
            });
          }
          // Guardar los datos del negocio asociado
          if (row.deal_name && row.deal_amount) {
            deals.push({
              email: row.contact_email,
              dealname: row.deal_name,
              amount: row.deal_amount,
              dealstage: row.deal_stage || "appointmentscheduled",
            });
          }
        })
        .on("end", resolve)
        .on("error", reject);
    });

    for (const contact of contacts) {
      try {
        // Verificar si el contacto ya existe
        let contactoExistente = await verificarContactoExistente(
          contact.email,
          contact.contact_id
        );
        let contactId;
        if (contactoExistente) {
          // Si ya existe, se actualiza
          await actualizarContacto(contactoExistente.id, contact);
          contactId = contactoExistente.id;
        } else {
          // Si no existe, se crea uno nuevo
          const response = await axios.post(
            `${hubspotBaseUrl}/crm/v3/objects/contacts`,
            { properties: contact },
            { headers: { Authorization: `Bearer ${hubspotApiKey}` } }
          );
          contactId = response.data.id;
          console.log(`Contacto creado: ${contact.email}`);
        }

        // Buscar los negocios relacionados con ese contacto
        const contactDeals = deals.filter((d) => d.email === contact.email);
        for (const deal of contactDeals) {
          try {
             // Crear el negocio
            const dealResponse = await axios.post(
              `${hubspotBaseUrl}/crm/v3/objects/deals`,
              {
                properties: {
                  dealname: deal.dealname,
                  amount: deal.amount,
                  dealstage: deal.dealstage,
                },
              },
              { headers: { Authorization: `Bearer ${hubspotApiKey}` } }
            );

            const dealId = dealResponse.data.id;
            console.log(`Negocio creado: ${deal.dealname} con ID: ${dealId}`);

            // Esperar 1 segundo para evitar límites de la API
            await new Promise((resolve) => setTimeout(resolve, 1000));
            // Asociar el negocio con el contacto
            await asociarContactoConNegocio(contactId, dealId);
          } catch (dealError) {
            console.error(
              `Error procesando negocio para ${contact.email}:`,
              dealError.message
            );
            continue;
          }
        }
      } catch (contactError) {
        console.error(
          `Error procesando contacto ${contact.email}:`,
          contactError.message
        );
        continue;
      }
    }

    res.json({
      success: true,
      message: "Datos subidos correctamente a HubSpot.",
    });
  } catch (error) {
    console.error("Error procesando el archivo:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  vistaPrincipal,
  subirArchivo,
};
